import dotenv from 'dotenv';
import { z } from 'zod';
import { sameSqliteFile } from '../src/lib/sqliteUrl.js';

dotenv.config();
const target = process.env.PLATFORM_DATABASE_URL;
const email = process.env.PLATFORM_DEMO_EMAIL?.trim();
const password = process.env.PLATFORM_DEMO_PASSWORD;

// A demonstração só pode ser criada explicitamente em um banco SQLite vazio.
if (process.env.NODE_ENV === 'production') throw new Error('A carga demonstrativa não pode ser executada em produção.');
if (!target?.startsWith('file:') || !email || !z.email().max(254).safeParse(email).success || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('Defina PLATFORM_DATABASE_URL SQLite, PLATFORM_DEMO_EMAIL válido e PLATFORM_DEMO_PASSWORD com 12 caracteres ou mais e até 72 bytes.');
}
if (process.env.DATABASE_URL && sameSqliteFile(target, process.env.DATABASE_URL)) {
  throw new Error('O banco de demonstração deve ser diferente do banco de turismo.');
}
process.env.DATABASE_URL = target;

async function main() {
  const [{ PrismaClient }, bcrypt] = await Promise.all([import('@prisma/client'), import('bcryptjs')]);
  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.default.hash(password!, 12);
    await prisma.$transaction(async tx => {
      const tables = await tx.$queryRaw<{ name: string }[]>`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'`;
      for (const { name } of tables) {
        // Identifiers come from SQLite's schema, not user input; quote embedded quotes.
        const quoted = `"${name.replace(/"/g, '""')}"`;
        const rows = await tx.$queryRawUnsafe<{ found: number }[]>(`SELECT 1 AS found FROM ${quoted} LIMIT 1`);
        if (rows.length) throw new Error('Use um banco de demonstração vazio e migrado.');
      }
      const user = await tx.user.create({ data: { name: 'Operador de demonstração', email: email!, passwordHash: hash, role: 'user' } });
      const org = await tx.organization.create({ data: { name: 'Pousada de demonstração', slug: 'pousada-demo', niche: 'pousada' } });
      await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'owner' } });
    });
    console.log('Demonstração criada no banco informado. Entre com o e-mail e a senha fornecidos.');
  } finally { await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Não foi possível criar a demonstração.'); process.exitCode = 1; });
