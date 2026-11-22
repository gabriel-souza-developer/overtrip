import { Response, NextFunction } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import { AuthRequest } from './auth.js';

export const ORGANIZATION_WRITE_ROLES = ['OWNER', 'ADMIN'];

export interface OrganizationRequest extends AuthRequest {
  organizationContext?: {
    organization: { id: string; name: string; slug: string; status: string; defaultPriceUnit: string | null; brandColor: string | null };
    membership: { id: string; role: string; status: string };
  };
}

type MembershipQueryClient = Pick<PrismaClient | Prisma.TransactionClient, 'membership'>;

/**
 * Único lugar que decide o que conta como vínculo utilizável: ativo, numa
 * empresa também ativa. Recebe o client (singleton OU `tx` de uma
 * transação) em vez de usá-lo fixo, para que uma escrita possa reconferir
 * isto DENTRO da própria transação da escrita — nunca só confiar no que o
 * middleware (abaixo) checou antes de abrir a transação, que pode já estar
 * obsoleto (revogação ou desativação entre as duas chamadas).
 */
export async function loadActiveOrganizationMembership(
  client: MembershipQueryClient,
  organizationId: string,
  userId: string,
): Promise<OrganizationRequest['organizationContext']> {
  const membership = await client.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
  if (!membership || membership.status !== 'ACTIVE' || membership.organization.status !== 'ACTIVE') return undefined;
  return {
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      defaultPriceUnit: membership.organization.defaultPriceUnit,
      brandColor: membership.organization.brandColor,
    },
    membership: { id: membership.id, role: membership.role, status: membership.status },
  };
}

/** Reconfere vínculo ativo, papel e empresa ativa DENTRO da transação da escrita — nunca a partir só do que o middleware viu antes de abrir a transação. Usada por toda rota de escrita no escopo de organização (viagens, interessados, ...). */
export async function assertOrganizationWriteAccess(tx: Prisma.TransactionClient, organizationId: string, userId: string): Promise<void> {
  const fresh = await loadActiveOrganizationMembership(tx, organizationId, userId);
  if (!fresh || !ORGANIZATION_WRITE_ROLES.includes(fresh.membership.role)) {
    throw new AppError(403, 'Sem permissão para esta operação nesta empresa', 'ORGANIZATION_ROLE_DENIED');
  }
}

// Revalida vínculo e papel a cada requisição (nunca a partir do token ou de uma
// chamada anterior): a empresa pode ter sido desativada ou o vínculo revogado
// entre duas requisições da mesma sessão.
export const requireOrganizationMembership = (...roles: string[]) => {
  return async (req: OrganizationRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const organizationId = req.params.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: 'organizationId é obrigatório' });
      return;
    }

    try {
      const context = await loadActiveOrganizationMembership(prisma, organizationId, req.user.id);
      if (!context) {
        res.status(403).json({ error: 'Sem acesso a esta empresa', code: 'ORGANIZATION_ACCESS_DENIED' });
        return;
      }

      if (roles.length > 0 && !roles.includes(context.membership.role)) {
        res.status(403).json({ error: 'Papel insuficiente para esta operação', code: 'ORGANIZATION_ROLE_DENIED' });
        return;
      }

      req.organizationContext = context;
      next();
    } catch (error) {
      next(error);
    }
  };
};
