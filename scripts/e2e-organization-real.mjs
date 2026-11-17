// Teste autônomo: frontend Vite -> API Express -> SQLite temporário real.
// Não usa o banco de teste compartilhado nem intercepta respostas HTTP.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'overtrip-real-e2e-'));
const dbPath = path.join(temporary, 'isolated.db');
const dbUrl = `file:${dbPath}`;
const password = 'senha-ficticia-e2e-123';
let api;
let vite;
let browser;
let prisma;

async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForApi(url) {
  for (let i = 0; i < 100; i++) {
    if (api.exitCode !== null) throw new Error('API de teste encerrou antes de iniciar');
    try { if ((await fetch(`${url}/health`)).ok) return; } catch {}
    await delay(200);
  }
  throw new Error('API de teste não iniciou');
}

async function login(page, frontendUrl, email, agency) {
  await page.goto(`${frontendUrl}/login`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByText(agency, { exact: true }).first().waitFor();
  await page.getByRole('heading', { name: 'Viagens', exact: true }).waitFor();
}

try {
  execFileSync(path.join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: root, env: { ...process.env, DATABASE_URL: dbUrl }, stdio: 'pipe', timeout: 30000,
  });
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const passwordHash = await bcrypt.hash(password, 10);
  for (const [id, name, email] of [['agency-a', 'Agência A', 'a@example.test'], ['agency-b', 'Agência B', 'b@example.test']]) {
    await prisma.organization.create({ data: { id, name, slug: id, status: 'ACTIVE' } });
    const user = await prisma.user.create({ data: { email, name, passwordHash, role: 'editor', legacyAccess: false } });
    await prisma.membership.create({ data: { userId: user.id, organizationId: id, role: 'OWNER', status: 'ACTIVE' } });
  }

  const apiPort = await unusedPort();
  vite = await createServer({ configFile: false, root: path.join(root, 'frontend'), plugins: [react()], server: {
    host: '127.0.0.1', port: 0, strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  }, logLevel: 'error' });
  await vite.listen();
  const frontendUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  api = spawn(path.join(root, 'node_modules/.bin/tsx'), ['src/index.ts'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: dbUrl, HOST: '127.0.0.1', PORT: String(apiPort), CORS_ORIGIN: frontendUrl,
      NODE_ENV: 'test', UPLOADS_DIR: path.join(temporary, 'uploads'), DOCUMENT_STORAGE_DIR: path.join(temporary, 'documents') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let apiErrors = '';
  api.stderr.on('data', chunk => { apiErrors += chunk.toString().slice(0, 1000); });
  await waitForApi(`http://127.0.0.1:${apiPort}`);

  browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const a = await contextA.newPage();
  await login(a, frontendUrl, 'a@example.test', 'Agência A');
  await a.getByRole('button', { name: 'Nova viagem' }).first().click();
  await a.getByLabel('Título').fill('Viagem exclusiva A');
  await a.getByLabel('Categoria').fill('Trilha');
  await a.getByLabel('Cidade').fill('Lucena');
  await a.getByLabel('Estado').fill('PB');
  await a.getByLabel('Data de saída').fill('2030-06-01T09:00');
  await a.getByLabel('Descrição').fill('Passeio fictício para teste.');
  await a.getByRole('button', { name: 'Salvar' }).click();
  await a.getByRole('heading', { name: 'Viagem exclusiva A' }).waitFor();
  const created = await prisma.trip.findFirstOrThrow({ where: { organizationId: 'agency-a', title: 'Viagem exclusiva A' } });
  if (created.status !== 'DRAFT') throw new Error('Viagem criada com status inesperado');
  await a.getByRole('button', { name: 'Editar Viagem exclusiva A' }).click();
  await a.getByLabel('Título').fill('Viagem exclusiva A revisada');
  await a.getByRole('button', { name: 'Salvar' }).click();
  await a.getByRole('heading', { name: 'Viagem exclusiva A revisada' }).waitFor();

  await a.getByRole('link', { name: 'Interessados' }).click();
  await a.getByRole('button', { name: 'Novo interessado' }).first().click();
  await a.getByLabel('Nome').fill('Interessado exclusivo A');
  await a.getByLabel('Telefone').fill('83999990000');
  await a.getByRole('button', { name: 'Salvar' }).click();
  await a.getByRole('heading', { name: 'Interessado exclusivo A', exact: true }).waitFor();
  const createdLead = await prisma.lead.findFirstOrThrow({ where: { organizationId: 'agency-a', name: 'Interessado exclusivo A' } });
  if (createdLead.stage !== 'NEW' || createdLead.organizationId !== 'agency-a') throw new Error('Interessado criado com dados inesperados');
  await a.getByRole('button', { name: 'Editar Interessado exclusivo A' }).click();
  await a.getByLabel('Etapa').selectOption('CONTACTED');
  await a.getByRole('button', { name: 'Salvar' }).click();
  await a.getByText('Contato realizado').waitFor();

  await a.getByRole('link', { name: 'Reservas' }).click();
  await a.getByRole('button', { name: 'Nova reserva' }).first().click();
  await a.getByLabel('Viagem').selectOption({ label: 'Viagem exclusiva A revisada' });
  await a.getByLabel('Cliente').fill('Cliente exclusivo A');
  await a.getByLabel('Telefone').fill('83988887777');
  await a.getByLabel('Lugares').fill('2');
  await a.getByLabel('Valor total (R$)').fill('500,00');
  await a.getByRole('button', { name: 'Salvar' }).click();
  await a.getByRole('heading', { name: 'Cliente exclusivo A', exact: true }).waitFor();
  const createdReservation = await prisma.reservation.findFirstOrThrow({ where: { organizationId: 'agency-a', customerName: 'Cliente exclusivo A' } });
  if (createdReservation.status !== 'PENDING' || createdReservation.totalCents !== 50000) throw new Error('Reserva criada com dados inesperados');
  await a.getByRole('button', { name: 'Editar reserva de Cliente exclusivo A' }).click();
  await a.getByLabel('Status').selectOption('CONFIRMED');
  await a.getByRole('button', { name: 'Salvar' }).click();
  await a.getByText('Confirmada').waitFor();
  const afterStatusChange = await prisma.reservation.findUniqueOrThrow({ where: { id: createdReservation.id } });
  if (afterStatusChange.status !== 'CONFIRMED') throw new Error('Status da reserva não foi atualizado');

  await a.getByRole('button', { name: 'Editar reserva de Cliente exclusivo A' }).click();
  const reservationDialog = a.getByRole('dialog', { name: 'Editar reserva' });
  await reservationDialog.getByLabel('Nova parcela (R$)').fill('200,00');
  await reservationDialog.getByLabel('Vencimento', { exact: true }).fill('2030-06-10');
  await reservationDialog.getByRole('button', { name: 'Adicionar parcela' }).click();
  await reservationDialog.getByRole('button', { name: 'Editar parcela de R$ 200,00' }).waitFor();
  let installment = await prisma.reservationInstallment.findFirstOrThrow({ where: { reservationId: createdReservation.id } });
  if (installment.amountCents !== 20000 || installment.paidAt !== null) throw new Error('Parcela criada com dados inesperados');
  await reservationDialog.getByRole('button', { name: 'Editar parcela de R$ 200,00' }).click();
  await reservationDialog.getByLabel('Valor da parcela (R$)').fill('225,00');
  await reservationDialog.getByRole('button', { name: 'Salvar', exact: true }).first().click();
  await reservationDialog.getByRole('button', { name: 'Editar parcela de R$ 225,00' }).waitFor();
  await reservationDialog.getByRole('button', { name: 'Marcar recebida' }).click();
  await reservationDialog.getByRole('button', { name: 'Desmarcar recebimento' }).waitFor();
  installment = await prisma.reservationInstallment.findUniqueOrThrow({ where: { id: installment.id } });
  if (installment.amountCents !== 22500 || installment.paidAt === null) throw new Error('Recebimento manual não foi registrado');
  await reservationDialog.getByRole('button', { name: 'Desmarcar recebimento' }).click();
  await reservationDialog.getByRole('button', { name: 'Marcar recebida' }).waitFor();
  if ((await prisma.reservationInstallment.findUniqueOrThrow({ where: { id: installment.id } })).paidAt !== null) throw new Error('Recebimento manual não foi desmarcado');

  const contextB = await browser.newContext();
  const b = await contextB.newPage();
  await login(b, frontendUrl, 'b@example.test', 'Agência B');
  await b.getByText('Nenhuma viagem cadastrada').waitFor();
  if (await b.getByText('Viagem exclusiva A revisada').count()) throw new Error('Viagem de outra agência apareceu na interface');
  const denied = await b.request.get(`${frontendUrl}/api/organizations/agency-a/tourism/trips/${created.id}`);
  if (denied.status() !== 403 && denied.status() !== 404) throw new Error(`Acesso cruzado inesperado: ${denied.status()}`);
  const legacyDenied = await b.request.get(`${frontendUrl}/api/trips`);
  if (legacyDenied.status() !== 403) throw new Error(`Painel legado acessível: ${legacyDenied.status()}`);
  const publicTrips = await (await b.request.get(`${frontendUrl}/api/public/trips`)).json();
  if (JSON.stringify(publicTrips).includes('Viagem exclusiva A')) throw new Error('Rascunho exibido no site público');

  await b.getByRole('link', { name: 'Interessados' }).click();
  await b.getByText('Nenhum interessado encontrado').waitFor();
  if (await b.getByText('Interessado exclusivo A').count()) throw new Error('Interessado de outra agência apareceu na interface');
  const leadDenied = await b.request.get(`${frontendUrl}/api/organizations/agency-a/tourism/leads/${createdLead.id}`);
  if (leadDenied.status() !== 403) throw new Error(`Acesso cruzado a interessado inesperado: ${leadDenied.status()}`);
  const leadWriteDenied = await b.request.put(`${frontendUrl}/api/organizations/agency-a/tourism/leads/${createdLead.id}`, { data: { stage: 'WON' } });
  if (leadWriteDenied.status() !== 403) throw new Error(`Escrita cruzada em interessado inesperada: ${leadWriteDenied.status()}`);
  const afterCrossAttempt = await prisma.lead.findUniqueOrThrow({ where: { id: createdLead.id } });
  if (afterCrossAttempt.stage !== 'CONTACTED') throw new Error('Tentativa cruzada alterou o interessado de outra empresa');

  await b.getByRole('link', { name: 'Reservas' }).click();
  await b.getByText('Nenhuma reserva encontrada').waitFor();
  if (await b.getByText('Cliente exclusivo A').count()) throw new Error('Reserva de outra agência apareceu na interface');
  const reservationDenied = await b.request.get(`${frontendUrl}/api/organizations/agency-a/tourism/reservations/${createdReservation.id}`);
  if (reservationDenied.status() !== 403) throw new Error(`Acesso cruzado a reserva inesperado: ${reservationDenied.status()}`);
  const reservationWriteDenied = await b.request.put(`${frontendUrl}/api/organizations/agency-a/tourism/reservations/${createdReservation.id}`, { data: { status: 'CANCELLED', expectedUpdatedAt: afterStatusChange.updatedAt } });
  if (reservationWriteDenied.status() !== 403) throw new Error(`Escrita cruzada em reserva inesperada: ${reservationWriteDenied.status()}`);
  const afterReservationCrossAttempt = await prisma.reservation.findUniqueOrThrow({ where: { id: createdReservation.id } });
  if (afterReservationCrossAttempt.status !== 'CONFIRMED') throw new Error('Tentativa cruzada alterou a reserva de outra empresa');

  const crossInstallment = await b.request.put(`${frontendUrl}/api/organizations/agency-a/tourism/reservations/${createdReservation.id}/installments/${installment.id}`, { data: { paid: true, expectedUpdatedAt: afterReservationCrossAttempt.updatedAt } });
  if (crossInstallment.status() !== 403) throw new Error(`Escrita cruzada em parcela inesperada: ${crossInstallment.status()}`);
  if ((await prisma.reservationInstallment.findUniqueOrThrow({ where: { id: installment.id } })).paidAt !== null) throw new Error('Tentativa cruzada alterou parcela de outra empresa');
  await reservationDialog.getByRole('button', { name: 'Excluir parcela de R$ 225,00' }).click();
  await a.getByRole('dialog', { name: 'Excluir parcela' }).getByRole('button', { name: 'Excluir', exact: true }).click();
  await reservationDialog.getByText('Nenhuma parcela cadastrada.').waitFor();
  if (await prisma.reservationInstallment.findUnique({ where: { id: installment.id } })) throw new Error('Parcela não foi excluída');
  await reservationDialog.getByRole('button', { name: 'Fechar' }).click();

  // Troca real de senha: a sessão termina, a senha anterior deixa de servir
  // e o novo login mantém as mesmas fronteiras entre empresas.
  const newPassword = 'nova-senha-ficticia-e2e-456';
  await a.getByRole('button', { name: 'Trocar senha' }).click();
  const passwordDialog = a.getByRole('dialog', { name: 'Trocar senha' });
  await passwordDialog.getByLabel('Senha atual').fill(password);
  await passwordDialog.locator('#new-password').fill(newPassword);
  await passwordDialog.getByLabel('Confirmar nova senha').fill(newPassword);
  await passwordDialog.getByRole('button', { name: 'Alterar senha' }).click();
  await a.waitForURL('**/login');
  await a.getByLabel('E-mail').fill('a@example.test');
  await a.getByLabel('Senha', { exact: true }).fill(password);
  await a.getByRole('button', { name: 'Entrar' }).click();
  await a.getByRole('alert').waitFor();
  if (!new URL(a.url()).pathname.endsWith('/login')) throw new Error('Senha anterior ainda autenticou');
  await a.getByLabel('Senha', { exact: true }).fill(newPassword);
  await a.getByRole('button', { name: 'Entrar' }).click();
  await a.getByText('Agência A', { exact: true }).first().waitFor();
  await a.getByRole('heading', { name: 'Viagem exclusiva A revisada' }).waitFor();
  const stillDenied = await b.request.get(`${frontendUrl}/api/organizations/agency-a/tourism/trips/${created.id}`);
  if (stillDenied.status() !== 403 && stillDenied.status() !== 404) throw new Error('Acesso cruzado permitido após troca de senha');
  await contextA.close();
  await contextB.close();
  console.log('PASS: duas agências, viagem, interessado, reserva, parcelas, troca de senha e isolamento de API/painel/site público.');
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : 'falha desconhecida');
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite?.close();
  if (api && api.exitCode === null) {
    api.kill('SIGTERM');
    await Promise.race([new Promise(resolve => api.once('exit', resolve)), delay(3000)]);
    if (api.exitCode === null) api.kill('SIGKILL');
  }
  await prisma?.$disconnect();
  await rm(temporary, { recursive: true, force: true });
}
