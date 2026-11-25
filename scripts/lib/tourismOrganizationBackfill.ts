import type { Prisma, PrismaClient } from '@prisma/client';

type Counts = { total: number; unassigned: number; target: number; other: number };
type TableCounts = { trip: Counts; lead: Counts; reservation: Counts; visit: Counts; galleryEntry: Counts; mediaAsset: Counts };

/** Only this class carries messages safe to expose in command output. */
export class BackfillError extends Error {}

async function counts(tx: Prisma.TransactionClient, organizationId: string): Promise<TableCounts> {
  const count = async (queries: [PromiseLike<number>, PromiseLike<number>, PromiseLike<number>]): Promise<Counts> => {
    const [total, unassigned, target] = await Promise.all(queries);
    return { total, unassigned, target, other: total - unassigned - target };
  };
  return {
    trip: await count([tx.trip.count(), tx.trip.count({ where: { organizationId: null } }), tx.trip.count({ where: { organizationId } })]),
    lead: await count([tx.lead.count(), tx.lead.count({ where: { organizationId: null } }), tx.lead.count({ where: { organizationId } })]),
    reservation: await count([tx.reservation.count(), tx.reservation.count({ where: { organizationId: null } }), tx.reservation.count({ where: { organizationId } })]),
    visit: await count([tx.visit.count(), tx.visit.count({ where: { organizationId: null } }), tx.visit.count({ where: { organizationId } })]),
    galleryEntry: await count([tx.galleryEntry.count(), tx.galleryEntry.count({ where: { organizationId: null } }), tx.galleryEntry.count({ where: { organizationId } })]),
    mediaAsset: await count([tx.mediaAsset.count(), tx.mediaAsset.count({ where: { organizationId: null } }), tx.mediaAsset.count({ where: { organizationId } })]),
  };
}

/** Any unassigned row would belong to target after the operation. */
async function validateRelations(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const foreignKeyViolations = await tx.$queryRaw<unknown[]>`PRAGMA foreign_key_check`;
  if (foreignKeyViolations.length) throw new BackfillError(`O banco contém ${foreignKeyViolations.length} referência(s) inválida(s). Nenhuma alteração foi aplicada.`);
  const [leadTrip] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM "Lead" l LEFT JOIN "Trip" t ON t.id = l."tripId"
    WHERE l."tripId" IS NOT NULL AND (t.id IS NULL OR COALESCE(l."organizationId", ${organizationId}) <> COALESCE(t."organizationId", ${organizationId}))`;
  const [reservationTrip] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM "Reservation" r LEFT JOIN "Trip" t ON t.id = r."tripId"
    WHERE t.id IS NULL OR COALESCE(r."organizationId", ${organizationId}) <> COALESCE(t."organizationId", ${organizationId})`;
  const [reservationLead] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM "Reservation" r LEFT JOIN "Lead" l ON l.id = r."leadId"
    WHERE r."leadId" IS NOT NULL AND (l.id IS NULL OR COALESCE(r."organizationId", ${organizationId}) <> COALESCE(l."organizationId", ${organizationId}) OR (l."tripId" IS NOT NULL AND l."tripId" <> r."tripId"))`;
  const [visitTrip] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM "Visit" v LEFT JOIN "Trip" t ON t.id = v."tripId"
    WHERE v."tripId" IS NOT NULL AND (t.id IS NULL OR COALESCE(v."organizationId", ${organizationId}) <> COALESCE(t."organizationId", ${organizationId}))`;
  const [galleryTrip] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM "GalleryEntry" g LEFT JOIN "Trip" t ON t.id = g."tripId"
    WHERE g."tripId" IS NOT NULL AND (t.id IS NULL OR COALESCE(g."organizationId", ${organizationId}) <> COALESCE(t."organizationId", ${organizationId}))`;
  const [galleryVisit] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM "GalleryEntry" g LEFT JOIN "Visit" v ON v.id = g."visitId"
    WHERE g."visitId" IS NOT NULL AND (v.id IS NULL OR COALESCE(g."organizationId", ${organizationId}) <> COALESCE(v."organizationId", ${organizationId}))`;
  if (Number(leadTrip.total) || Number(reservationTrip.total) || Number(reservationLead.total) || Number(visitTrip.total) || Number(galleryTrip.total) || Number(galleryVisit.total)) {
    throw new BackfillError(`Relacionamentos incompatíveis: interessados/viagens=${leadTrip.total}, reservas/viagens=${reservationTrip.total}, reservas/interessados=${reservationLead.total}, visitas/viagens=${visitTrip.total}, galeria/viagens=${galleryTrip.total}, galeria/visitas=${galleryVisit.total}. Nenhuma alteração foi aplicada.`);
  }
}

/** No users are created or changed; only NULL owners are assigned. */
export async function backfillTourismOrganizations(client: PrismaClient, organizationId: string, apply: boolean) {
  if (!organizationId.trim() || organizationId.length > 128) throw new BackfillError('Informe o ID válido de uma empresa existente.');
  return client.$transaction(async tx => {
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, status: true } });
    if (!organization) throw new BackfillError('Empresa não encontrada. Nenhuma alteração foi aplicada.');
    if (organization.status !== 'ACTIVE') throw new BackfillError('A empresa selecionada está inativa. Nenhuma alteração foi aplicada.');
    const before = await counts(tx, organizationId);
    await validateRelations(tx, organizationId);
    if (!apply) return { mode: 'simulation' as const, organizationId, before };
    // Raw parameterized updates leave every other column (including Prisma's
    // automatically managed updatedAt) unchanged.
    const trips = await tx.$executeRaw`UPDATE "Trip" SET "organizationId" = ${organizationId} WHERE "organizationId" IS NULL`;
    const leads = await tx.$executeRaw`UPDATE "Lead" SET "organizationId" = ${organizationId} WHERE "organizationId" IS NULL`;
    const reservations = await tx.$executeRaw`UPDATE "Reservation" SET "organizationId" = ${organizationId} WHERE "organizationId" IS NULL`;
    const visits = await tx.$executeRaw`UPDATE "Visit" SET "organizationId" = ${organizationId} WHERE "organizationId" IS NULL`;
    const galleryEntries = await tx.$executeRaw`UPDATE "GalleryEntry" SET "organizationId" = ${organizationId} WHERE "organizationId" IS NULL`;
    const mediaAssets = await tx.$executeRaw`UPDATE "MediaAsset" SET "organizationId" = ${organizationId} WHERE "organizationId" IS NULL`;
    const after = await counts(tx, organizationId);
    for (const [name, updated] of [['trip', trips], ['lead', leads], ['reservation', reservations], ['visit', visits], ['galleryEntry', galleryEntries], ['mediaAsset', mediaAssets]] as const) {
      if (updated !== before[name].unassigned || after[name].unassigned !== 0 || after[name].target !== before[name].target + updated || after[name].other !== before[name].other || after[name].total !== before[name].total) {
        throw new BackfillError(`Contagem inconsistente em ${name}; a transação foi revertida.`);
      }
    }
    await validateRelations(tx, organizationId);
    return { mode: 'applied' as const, organizationId, before, after };
  }, { timeout: 30000 });
}
