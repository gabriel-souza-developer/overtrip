import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { tripService } from '../services/index.js';
import { tripCreateSchema } from '../validators/index.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const saveSchema = z.object({
  sourceTripId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(160),
}).strict();

const summary = ({ id, name, sourceTripTitle, createdAt, updatedAt }: {
  id: string; name: string; sourceTripTitle: string; createdAt: Date; updatedAt: Date;
}) => ({ id, name, sourceTripTitle, createdAt, updatedAt });

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const data = await prisma.tripTemplate.findMany({
    select: { id: true, name: true, sourceTripTitle: true, createdAt: true, updatedAt: true },
    orderBy: [{ name: 'asc' }, { updatedAt: 'desc' }],
  });
  res.json({ data });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const template = await prisma.tripTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) throw AppError.notFound('Modelo de viagem não encontrado.');
  let snapshot: unknown;
  try { snapshot = JSON.parse(template.snapshot); }
  catch { throw AppError.internal('Não foi possível ler os dados deste modelo.'); }
  res.json({ ...summary(template), snapshot });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { sourceTripId, name } = saveSchema.parse(req.body);
  const source = await tripService.findById(sourceTripId);
  // JSON round-trip normaliza datas e preserva listas já decodificadas pelo serviço.
  // O schema seleciona os campos de viagem permitidos e exclui ids/relações.
  const snapshot = tripCreateSchema.parse(JSON.parse(JSON.stringify(source)));
  const { storedIdentity: _storedIdentity, ...data } = snapshot;
  const template = await prisma.tripTemplate.upsert({
    where: { sourceTripId },
    create: { sourceTripId, sourceTripTitle: source.title, name, snapshot: JSON.stringify(data) },
    update: { sourceTripTitle: source.title, name, snapshot: JSON.stringify(data) },
    select: { id: true, name: true, sourceTripTitle: true, createdAt: true, updatedAt: true },
  });
  res.status(201).json(template);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const deleted = await prisma.tripTemplate.deleteMany({ where: { id: req.params.id } });
  if (!deleted.count) throw AppError.notFound('Modelo de viagem não encontrado.');
  res.json({ success: true });
}));

export default router;
