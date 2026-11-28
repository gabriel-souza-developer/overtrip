import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import type { AuthRequest } from './auth.js';
import { currentLegacyTourismFilter } from '../services/legacyTourismScope.js';

/**
 * Revalida que :tripId pertence ao escopo legado (organizationId null, ou a
 * organização configurada em LEGACY_TOURISM_ORGANIZATION_ID) antes de listar,
 * enviar, baixar ou excluir documentos. Sem isto, o operador legado poderia
 * acessar documentos privados de uma viagem de outra empresa só por adivinhar
 * o ID.
 *
 * LIMITE CONHECIDO: esta checagem roda como middleware, fora de qualquer
 * transação com a operação do handler seguinte (upload faz varredura de
 * antivírus e escrita em disco — processos longos que não devem ficar dentro
 * de uma transação de banco). Entre a checagem e a operação há uma janela
 * teórica de TOCTOU. Não é fechada aqui porque nenhuma rota viva deste
 * serviço muda Trip.organizationId em tempo de execução (só
 * scripts/backfill-tourism-organization.ts, offline, via SQL bruto, fora do
 * ciclo de requisições HTTP); se isso mudar, esta checagem deixa de ser
 * suficiente e precisa ser revisitada.
 */
export const requireLegacyTripScope = async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
  const tripId = req.params.tripId;
  if (!tripId) { next(AppError.badRequest('tripId é obrigatório')); return; }
  try {
    const trip = await prisma.trip.findFirst({ where: { id: tripId, ...currentLegacyTourismFilter() }, select: { id: true } });
    if (!trip) { next(AppError.notFound('Viagem não encontrada')); return; }
    next();
  } catch (error) {
    next(error);
  }
};
