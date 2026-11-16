import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth.js';

/** Contexto só é confiável após consultar o vínculo atual no banco. */
export interface OrganizationContext {
  id: string;
  name: string;
  slug: string;
  niche: string;
  role: string;
}

export interface OrganizationRequest extends AuthRequest {
  organization?: OrganizationContext;
}

export interface MembershipReader {
  findActiveMembership(userId: string, organizationId: string): Promise<OrganizationContext | null>;
}

/**
 * Preparação para rotas migradas: exige autenticação anterior, resolve o ID
 * solicitado e consulta a associação a cada requisição. Não aplicar às rotas
 * legadas até que todas as consultas e arquivos tenham escopo de empresa.
 */
export function requireOrganization(reader: MembershipReader) {
  return async (req: OrganizationRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const id = req.get('X-Organization-Id');
    if (!id || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Selecione uma empresa válida.' });
      return;
    }
    try {
      const organization = await reader.findActiveMembership(req.user.id, id);
      if (!organization || organization.id !== id) {
        res.status(403).json({ error: 'Acesso à empresa não autorizado.' });
        return;
      }
      req.organization = organization;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Autoriza pelo papel do vínculo, nunca pelo papel global da conta. */
export function authorizeOrganization(...roles: string[]) {
  return (req: OrganizationRequest, res: Response, next: NextFunction): void => {
    if (!req.organization || !roles.includes(req.organization.role)) {
      res.status(403).json({ error: 'Permissão insuficiente nesta empresa.' });
      return;
    }
    next();
  };
}
