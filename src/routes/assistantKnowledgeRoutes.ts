import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { approveAssistantKnowledge, getAssistantKnowledge, listAssistantKnowledgeVersions } from '../services/assistantKnowledge.js';

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/', asyncHandler(async (_req: AuthRequest, res: import('express').Response) => {
  res.json(await getAssistantKnowledge());
}));
router.get('/versions', asyncHandler(async (_req: AuthRequest, res: import('express').Response) => {
  res.json(await listAssistantKnowledgeVersions());
}));
router.get('/versions/:version', asyncHandler(async (req: AuthRequest, res: import('express').Response) => {
  const raw = req.params.version;
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw AppError.badRequest('Versão inválida');
  const result = await getAssistantKnowledge(Number(raw));
  if (!result) throw AppError.notFound('Versão não encontrada');
  res.json(result);
}));
router.post('/', asyncHandler(async (req: AuthRequest, res: import('express').Response) => {
  const body = z.object({ expectedVersion: z.number().int().positive().nullable(), entries: z.unknown() }).strict().parse(req.body);
  res.status(201).json(await approveAssistantKnowledge(req.user!.id, body.entries, body.expectedVersion));
}));

export default router;
