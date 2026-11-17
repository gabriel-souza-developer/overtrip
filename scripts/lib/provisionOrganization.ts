import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

export class ProvisionError extends Error {}

const inputSchema = z.object({
  organizationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  organizationName: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  email: z.email().max(254).regex(/^[\x21-\x7e]+$/).transform(value => value.toLowerCase()),
  userName: z.string().trim().min(1).max(120),
}).strict();

export type ProvisionInput = z.input<typeof inputSchema>;

export async function provisionOrganization(client: PrismaClient, raw: ProvisionInput, password: string | undefined, apply = false): Promise<'simulation' | 'applied'> {
  const result = inputSchema.safeParse(raw);
  if (!result.success) throw new ProvisionError('Dados de criação inválidos.');
  const input = result.data;
  if (apply && (!password || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || /[\r\n\0]/.test(password))) {
    throw new ProvisionError('Senha inválida: use de 8 caracteres até 72 bytes, sem quebras de linha.');
  }
  // O hash é calculado antes da transação para não manter o banco bloqueado.
  const passwordHash = apply ? await bcrypt.hash(password!, 12) : undefined;
  return client.$transaction(async tx => {
    const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "User" WHERE lower(email) = ${input.email} LIMIT 1`);
    if (existing.length) throw new ProvisionError('Já existe uma conta com este endereço; nenhuma conta foi alterada ou vinculada.');
    if (await tx.organization.findFirst({ where: { OR: [{ id: input.organizationId }, { slug: input.slug }] }, select: { id: true } })) {
      throw new ProvisionError('ID ou identificador de empresa já utilizado.');
    }
    if (!apply) return 'simulation';
    const organization = await tx.organization.create({ data: { id: input.organizationId, name: input.organizationName, slug: input.slug, status: 'ACTIVE' }, select: { id: true } });
    const user = await tx.user.create({ data: { email: input.email, name: input.userName, passwordHash: passwordHash!, role: 'editor', legacyAccess: false }, select: { id: true } });
    await tx.membership.create({ data: { organizationId: organization.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' } });
    return 'applied';
  });
}
