import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import {
  addPassengerToTrip,
  addExistingPassengerToTrip,
  assignUnassignedPassenger,
  driverPassengerCsv,
  importPassengerWorkbook,
  listPassengerProfiles,
  listTripPassengers,
  listUnassignedPassengers,
  privatePassengerDetails,
  PassengerDataError,
  PassengerDataUnavailable,
  PASSENGER_PAYMENT_STATUSES,
  updateTripPassenger,
} from '../services/passengers.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate, authorize('admin'));

const id = z.string().min(1).max(128);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const passengerFields = {
  fullName: z.string().trim().min(2).max(150),
  phone: nullableText(160),
  document: nullableText(160),
  emergencyContact: nullableText(240),
  email: nullableText(160),
};
const createPassengerSchema = z.object(passengerFields).strict();
const updateSchema = z.object({
  paymentStatus: z.enum(PASSENGER_PAYMENT_STATUSES).nullable().optional(),
  amountCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  attended: z.boolean().nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Informe um campo.');

router.get('/profiles', asyncHandler(async (req: Request, res: Response) => {
  const query = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(200).default(100), search: z.string().trim().max(100).optional() }).strict().parse(req.query);
  res.json(await listPassengerProfiles(query));
}));

router.get('/unassigned', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await listUnassignedPassengers() });
}));

router.post('/import-workbook', express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '5mb' }), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!Buffer.isBuffer(req.body)) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' }); return; }
  const result = await importPassengerWorkbook(req.body, req.user!.id);
  res.status(200).json(result);
}));

router.get('/trips/:tripId', asyncHandler(async (req: Request, res: Response) => {
  res.json(await listTripPassengers(id.parse(req.params.tripId)));
}));

router.post('/trips/:tripId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tripId = id.parse(req.params.tripId);
  const existing = z.object({ profileId: id }).strict().safeParse(req.body);
  if (existing.success) { res.status(201).json(await addExistingPassengerToTrip(tripId, existing.data.profileId, req.user!.id)); return; }
  const data = createPassengerSchema.parse(req.body);
  res.status(201).json(await addPassengerToTrip(tripId, data, req.user!.id));
}));

router.get('/trips/:tripId/:passengerTripId/private-details', asyncHandler(async (req: Request, res: Response) => {
  res.json(await privatePassengerDetails(id.parse(req.params.tripId), id.parse(req.params.passengerTripId)));
}));

router.patch('/trips/:tripId/:passengerTripId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tripId = id.parse(req.params.tripId);
  const passengerTripId = id.parse(req.params.passengerTripId);
  const data = updateSchema.parse(req.body);
  res.json(await updateTripPassenger(tripId, passengerTripId, data, req.user!.id));
}));

router.post('/unassigned/:passengerTripId/assign', asyncHandler(async (req: AuthRequest, res: Response) => {
  const passengerTripId = id.parse(req.params.passengerTripId);
  const body = z.object({ tripId: id }).strict().parse(req.body);
  res.json(await assignUnassignedPassenger(passengerTripId, body.tripId, req.user!.id));
}));

router.get('/trips/:tripId/driver-list.csv', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tripId = id.parse(req.params.tripId);
  const result = await driverPassengerCsv(tripId, req.user!.id);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.set('X-Passenger-Count', String(result.rowCount));
  res.send(result.contents);
}));

router.use((err: unknown, _req: Request, res: Response, next: (error?: unknown) => void) => {
  if (err instanceof PassengerDataUnavailable) { res.status(503).json({ error: 'PASSENGER_DATA_PROTECTION_NOT_CONFIGURED' }); return; }
  if (err instanceof PassengerDataError) {
    const status = err.code === 'INVALID_WORKBOOK' || err.code === 'TOO_MANY_ROWS' || err.code === 'INVALID_INPUT' ? 400
      : err.code === 'TRIP_NOT_FOUND' || err.code === 'PROFILE_NOT_FOUND' ? 404
        : 409;
    const messages: Record<PassengerDataError['code'], string> = {
      INVALID_WORKBOOK: 'A planilha não corresponde ao modelo de passageiros OVERTRIP.',
      TOO_MANY_ROWS: 'A planilha excede o limite de linhas permitido para uma importação.',
      TRIP_NOT_FOUND: 'TRIP não encontrada.',
      PROFILE_NOT_FOUND: 'Passageiro não encontrado nesta TRIP.',
      DUPLICATE_PASSENGER: 'Este passageiro já está nesta TRIP.',
      INVALID_INPUT: 'Confira os dados obrigatórios do passageiro.',
    };
    res.status(status).json({ error: err.code, message: messages[err.code] }); return;
  }
  if (err instanceof AppError) { next(err); return; }
  // Erros do parser/DB nunca devem serializar conteúdo da planilha.
  console.error('Falha protegida ao processar dados de passageiros.');
  res.status(503).json({ error: 'PASSENGER_SERVICE_UNAVAILABLE' });
});

export default router;
