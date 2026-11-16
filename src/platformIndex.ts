import dotenv from 'dotenv';
import { sameSqliteFile } from './lib/sqliteUrl.js';

// A configuração deve ser definida antes de carregar Prisma, autenticação e app.
dotenv.config();
const databaseUrl = process.env.PLATFORM_DATABASE_URL;
const secret = process.env.PLATFORM_JWT_SECRET;
if (!databaseUrl || !secret) throw new Error('Defina PLATFORM_DATABASE_URL e PLATFORM_JWT_SECRET específicos da plataforma.');
if (databaseUrl === process.env.DATABASE_URL || (process.env.DATABASE_URL && sameSqliteFile(databaseUrl, process.env.DATABASE_URL)) || secret === process.env.JWT_SECRET) {
  throw new Error('O banco e o segredo da plataforma devem ser diferentes dos valores do turismo.');
}
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = secret;

async function start() {
  const { config } = await import('./config.js');
  const { platformApp: app } = await import('./platformApp.js');
  const port = Number(process.env.PLATFORM_PORT || 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PLATFORM_PORT inválida.');
  const server = app.listen(...([port, ...(config.host ? [config.host] : [])] as [number]), () => console.log(`API da plataforma em ${port}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
void start().catch(error => { console.error('Não foi possível iniciar a API da plataforma:', error); process.exitCode = 1; });
