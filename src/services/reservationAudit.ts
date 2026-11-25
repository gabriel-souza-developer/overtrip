import type { Prisma } from '@prisma/client';

// Trilha mínima de auditoria para mutações de reserva (ver ReservationAuditLog
// em prisma/schema.prisma): só ator, ação, entidade, empresa e quando — nunca
// nome/telefone de cliente, valor em centavos, observação ou conteúdo de
// documento. Usada tanto pelas rotas de organização
// (organizationReservationRoutes.ts, organizationId sempre presente) quanto
// pela operação legada (reservationRoutes.ts), que também pode mutar
// reservas de uma empresa real quando LEGACY_TOURISM_ORGANIZATION_ID está
// configurado (modo compartilhado) — ver legacyTourismScope.ts.
export type ReservationAuditAction =
  | 'RESERVATION_CREATED'
  | 'RESERVATION_UPDATED'
  | 'INSTALLMENT_CREATED'
  | 'INSTALLMENT_UPDATED'
  | 'INSTALLMENT_DELETED';
export type ReservationAuditEntityType = 'Reservation' | 'ReservationInstallment';

/**
 * Chamar SEMPRE dentro da MESMA transação da mutação: se a mutação não se
 * concretizar (erro, conflito de versão, papel revogado, ou a própria
 * gravação de auditoria falhar), esta linha também não é gravada — nunca
 * existe entrada de auditoria sem a mudança correspondente, nem o oposto.
 *
 * organizationId nulo (reserva legada sem empresa, o caso comum da operação
 * legada fora do modo compartilhado) nunca grava nada: não há empresa a
 * quem pertença esse histórico, e o comportamento de reservas legadas sem
 * empresa não deve mudar. Só grava quando organizationId pertence ao
 * escopo autorizado da chamada (a própria empresa, nas rotas de
 * organização; a única empresa configurada em
 * LEGACY_TOURISM_ORGANIZATION_ID, na operação legada) — nunca a de outra
 * empresa, o que a consulta/filtro de escopo de cada rota já garante antes
 * de esta função ser chamada.
 */
export async function recordReservationAuditIfOwned(tx: Prisma.TransactionClient, params: {
  organizationId: string | null;
  actorUserId: string;
  action: ReservationAuditAction;
  entityType: ReservationAuditEntityType;
  entityId: string;
  reservationId: string;
}): Promise<void> {
  if (!params.organizationId) return;
  await tx.reservationAuditLog.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      reservationId: params.reservationId,
    },
  });
}
