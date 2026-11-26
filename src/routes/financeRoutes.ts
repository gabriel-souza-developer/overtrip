import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { currentLegacyDestinationFilter, currentReservationAccessSql } from '../services/legacyTourismScope.js';
import { summarizeFinanceOutings, summarizeReservations } from '../services/financeSummary.js';

// Painel financeiro do painel OVERTRIP (atrás do legacyGate em app.ts): só
// administradores e só leitura. Valores lançados à mão; nada processa pagamento.
const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authorize('admin'));

const query = z.object({ year: z.union([z.literal('all'), z.coerce.number().int().min(2000).max(2100)]).optional() }).strict();

router.get('/summary', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { year } = query.parse(req.query);
  const now = new Date();
  const { outings, reservations } = await prisma.$transaction(async (tx) => {
    const rows = await tx.destinationOuting.findMany({
      where: { destination: { is: currentLegacyDestinationFilter() } },
      select: {
        id: true, date: true, status: true, parentOutingId: true, passengers: true, courtesySeats: true, pricePerPersonCents: true, transportCostCents: true, extraCostCents: true, notes: true,
        destination: { select: { id: true, name: true } },
        // Paradas só do mesmo escopo: vínculo cruzado nunca expõe nome de outra empresa.
        stops: { where: { destination: { is: currentLegacyDestinationFilter() } }, select: { destination: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    const access = currentReservationAccessSql();
    return {
      outings: rows.map(({ destination, stops, ...row }) => ({
        ...row, destinationId: destination.id, destinationName: destination.name,
        stops: stops.map((stop) => ({ destinationId: stop.destination.id, destinationName: stop.destination.name })),
      })),
      reservations: await summarizeReservations(tx, access.join, access.where, now),
    };
  });
  // Padrão: o ano mais recente com saídas (ou "todos", se não houver nenhuma).
  const preview = summarizeFinanceOutings(outings, null, now);
  const selected = year === 'all' ? null : year ?? preview.years.at(-1) ?? null;
  res.json({ outings: selected === null ? preview : summarizeFinanceOutings(outings, selected, now), reservations });
}));

export default router;
