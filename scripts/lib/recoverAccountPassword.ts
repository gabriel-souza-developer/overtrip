import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

export class AccountRecoveryError extends Error {}

/** Operação administrativa local. O ID identifica exatamente uma conta. */
export async function recoverAccountPassword(
  client: PrismaClient,
  userId: string,
  password: string | undefined,
  apply = false,
): Promise<'simulation' | 'applied'> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(userId)) throw new AccountRecoveryError('ID de usuário inválido.');
  if (apply && (!password || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || /[\r\n\0]/.test(password))) {
    throw new AccountRecoveryError('Senha inválida: use pelo menos 8 caracteres e até 72 bytes, sem quebras de linha.');
  }
  // Hash antes da transação reduz o tempo de bloqueio do SQLite.
  const passwordHash = apply ? await bcrypt.hash(password!, 12) : undefined;
  return client.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, updatedAt: true } });
    if (!user) throw new AccountRecoveryError('Conta não encontrada.');
    if (!apply) return 'simulation';
    // O mesmo campo usado na autenticação invalida tokens de todas as sessões.
    const updatedAt = new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1));
    const result = await tx.user.updateMany({
      where: { id: user.id, updatedAt: user.updatedAt },
      data: { passwordHash: passwordHash!, updatedAt },
    });
    if (result.count !== 1) throw new AccountRecoveryError('A conta foi alterada durante a operação. Verifique o estado antes de tentar novamente.');
    return 'applied';
  });
}
