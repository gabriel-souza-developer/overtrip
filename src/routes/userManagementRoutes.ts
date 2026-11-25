import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(authorize('admin'));
const userSelect = { id: true, name: true, email: true, role: true, mustChangePassword: true } as const;
const creation = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254), role: z.enum(['admin', 'editor']) }).strict();
const roleChange = z.object({ role: z.enum(['admin', 'editor']) }).strict();
async function requireCurrentAdmin(tx: Prisma.TransactionClient, actor: NonNullable<AuthRequest['user']>) {
  const current = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, legacyAccess: true, mustChangePassword: true, updatedAt: true } });
  if (!current || current.role !== 'admin' || !current.legacyAccess || current.mustChangePassword || current.updatedAt.getTime() !== actor.sessionVersion.getTime()) throw AppError.forbidden('Sua permissão mudou. Entre novamente.');
}

// This interface manages only accounts explicitly granted access to the legacy panel.
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({ where: { legacyAccess: true }, select: userSelect, orderBy: { name: 'asc' } });
  res.json(users);
}));

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = creation.parse(req.body);
  const email = input.email.toLowerCase();
  const temporaryPassword = randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const user = await prisma.$transaction(async tx => {
    await requireCurrentAdmin(tx, req.user!);
    // SQLite's unique constraint is case-sensitive; never reuse another account's email.
    const collision = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM User WHERE lower(email) = ${email} LIMIT 1`;
    if (collision.length) throw AppError.conflict('Já existe uma conta com este e-mail.');
    return tx.user.create({ data: { name: input.name, email, role: input.role, legacyAccess: true, mustChangePassword: true, passwordHash }, select: userSelect });
  });
  res.status(201).json({ user, temporaryPassword });
}));

router.patch('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role } = roleChange.parse(req.body);
  if (req.params.id === req.user!.id) throw AppError.badRequest('Você não pode alterar sua própria permissão.');
  const user = await prisma.$transaction(async tx => {
    await requireCurrentAdmin(tx, req.user!);
    const existing = await tx.user.findFirst({ where: { id: req.params.id, legacyAccess: true }, select: { id: true, role: true, updatedAt: true } });
    if (!existing) throw AppError.notFound('Usuário não encontrado.');
    if (existing.role === 'admin' && role !== 'admin' && await tx.user.count({ where: { legacyAccess: true, role: 'admin' } }) <= 1) throw AppError.conflict('É necessário manter ao menos um administrador.');
    // Advancing updatedAt revokes existing sessions after a permission change.
    if (existing.role === role) return tx.user.findUniqueOrThrow({ where: { id: existing.id }, select: userSelect });
    return tx.user.update({ where: { id: existing.id }, data: { role, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) }, select: userSelect });
  });
  res.json(user);
}));

export default router;
