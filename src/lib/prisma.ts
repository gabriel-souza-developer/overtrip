import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  // Prisma's default error logger prints query arguments (including customer
  // data). Keep an operational signal without serializing the event message.
  const client = new PrismaClient({ log: [{ emit: 'event', level: 'error' }] });
  client.$on('error', () => console.error('Erro no acesso ao banco de dados.'));
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
