import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  // A mensagem padrão do Prisma pode conter valores privados das consultas
  // (incluindo dados de clientes). Mantém o sinal operacional sem serializar
  // a mensagem do evento.
  const client = new PrismaClient({ log: [{ emit: 'event', level: 'error' }] });
  client.$on('error', () => console.error('Erro no acesso ao banco de dados.'));
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
