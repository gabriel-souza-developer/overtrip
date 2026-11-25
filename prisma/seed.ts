import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // A conta inicial é a única criação automática com acesso ao painel global.
  // Não ampliar permissões de contas existentes nem criar um operador legado
  // automaticamente em uma instalação que já tem usuários.
  const adminEmail = 'admin@overtrip.com.br';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const created = await prisma.$transaction(async tx => {
    const existingAdmin = await tx.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
    if (existingAdmin) return false;
    if (await tx.user.count() !== 0) throw new SeedError('A instalação já possui usuários; não é possível criar automaticamente o operador legado.');
    if (!adminPassword || adminPassword.length < 8 || Buffer.byteLength(adminPassword, 'utf8') > 72) {
      throw new SeedError('Defina ADMIN_PASSWORD com pelo menos 8 caracteres e no máximo 72 bytes.');
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await tx.user.create({ data: { email: adminEmail, name: 'Administrador OVERTRIP', passwordHash, role: 'admin', legacyAccess: true } });
    return true;
  });
  console.log(created ? '✅ Operador inicial criado.' : 'ℹ️  Operador inicial já existe; permissões preservadas.');

  console.log('✅ Seeding completed');
}

class SeedError extends Error {}

main()
  .catch((error: unknown) => {
    // Erros do banco podem incluir parâmetros; não registrar dados da consulta.
    console.error(error instanceof SeedError ? error.message : '❌ Não foi possível inicializar o operador.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
