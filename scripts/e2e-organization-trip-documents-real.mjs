// Teste autônomo ponta a ponta do fluxo "PDFs do roteiro" por empresa,
// incluindo o caso LEGACY_TOURISM_ORGANIZATION_ID. Mesma convenção de
// e2e-organization-real.mjs: frontend Vite -> API Express -> SQLite
// temporário real, sem banco de teste compartilhado nem interceptação de
// HTTP. Além disso, aqui também sobe o WORKER de extração
// (src/documentWorker.ts) como processo próprio, para provar a esteira real
// upload -> disco -> worker -> pdftotext -> TripDocumentPage.
//
// LIMITES DESTE AMBIENTE (nunca escondidos nem simulados em silêncio):
//  - pdftotext: REAL (binário do próprio host, caminho abaixo).
//  - worker de extração: REAL, processo próprio (tsx src/documentWorker.ts).
//  - banco: REAL SQLite temporário (prisma migrate deploy), descartado ao final.
//  - antivírus (clamd): INDISPONÍVEL neste host (serviço clamav-daemon
//    inativo, sem socket). O "scanner" usado aqui é um executável próprio
//    que sempre aprova — ver `scannerScript` abaixo — e isto é dito em voz
//    alta no relatório final. Nunca tratamos isto como validação do ClamAV
//    real; só prova que o resto da esteira (upload, storage, worker,
//    extração, download, exclusão) funciona quando o scanner aprova.
//  - IA de sugestões: nunca chamamos um provedor externo de verdade (sem
//    custo, sem credencial). O teste verifica o caminho real de "IA
//    desativada" (DOCUMENT_AI_EXTERNAL_ENABLED não configurado) — um
//    comportamento genuíno do servidor, não uma resposta de IA simulada.
import { mkdtemp, rm, writeFile, chmod, readdir, access } from 'node:fs/promises';
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

const REAL_PDFTOTEXT_PATH = '/usr/bin/pdftotext';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'overtrip-real-e2e-documents-'));
const dbPath = path.join(temporary, 'isolated.db');
const dbUrl = `file:${dbPath}`;
const documentsDir = path.join(temporary, 'documents');
const password = 'senha-ficticia-e2e-doc-123';
const SIMULATED_TEXT = 'Roteiro de teste no mirante de Matureia PB';

let api;
let worker;
let vite;
let browser;
let prisma;
let debugPage;
const limitations = [];
const checks = [];

function record(label, ok) {
  checks.push({ label, ok });
  if (!ok) throw new Error(`Falhou: ${label}`);
}

async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
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
  await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await page.getByRole('heading', { name: 'Viagens', exact: true }).waitFor();
}

/** PDF mínimo, mas de verdade: pdftotext real extrai este texto do stream de conteúdo. */
function buildRealPdf(text) {
  const content = `BT /F1 24 Tf 20 100 Td (${text}) Tj ET`;
  const body = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 900 144] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${Buffer.byteLength(content, 'latin1')} >>
stream
${content}
endstream
endobj
trailer
<< /Size 6 /Root 1 0 R >>
%%EOF
`;
  return Buffer.from(body, 'latin1');
}

try {
  // Scanner SIMULADO explicitamente: clamd está indisponível neste host
  // (ver limitations abaixo). Este executável nunca finge analisar o
  // conteúdo — só aprova sempre, documentado como simulação.
  const scannerScript = path.join(temporary, 'fake-clamdscan-SIMULADO.sh');
  await writeFile(scannerScript, '#!/bin/sh\n# SIMULADO: aprova sempre porque o clamd real está indisponível neste ambiente.\nexit 0\n');
  await chmod(scannerScript, 0o755);
  try { await access(REAL_PDFTOTEXT_PATH); } catch { throw new Error(`pdftotext real não encontrado em ${REAL_PDFTOTEXT_PATH}; ajuste REAL_PDFTOTEXT_PATH para rodar este teste.`); }

  execFileSync(path.join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: root, env: { ...process.env, DATABASE_URL: dbUrl }, stdio: 'pipe', timeout: 30000,
  });
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const passwordHash = await bcrypt.hash(password, 10);

  const orgAId = 'doc-agency-a';
  const orgBId = 'doc-agency-b';
  await prisma.organization.create({ data: { id: orgAId, name: 'Agência Documentos A', slug: orgAId, status: 'ACTIVE' } });
  await prisma.organization.create({ data: { id: orgBId, name: 'Agência Documentos B', slug: orgBId, status: 'ACTIVE' } });
  const ownerA = await prisma.user.create({ data: { email: 'doc-a@example.test', name: 'Agência Documentos A', passwordHash, role: 'editor', legacyAccess: false } });
  await prisma.membership.create({ data: { userId: ownerA.id, organizationId: orgAId, role: 'OWNER', status: 'ACTIVE' } });
  const ownerB = await prisma.user.create({ data: { email: 'doc-b@example.test', name: 'Agência Documentos B', passwordHash, role: 'editor', legacyAccess: false } });
  await prisma.membership.create({ data: { userId: ownerB.id, organizationId: orgBId, role: 'OWNER', status: 'ACTIVE' } });
  // Operador legado (sem vínculo de empresa — autorizado por role, não por
  // Membership): LEGACY_TOURISM_ORGANIZATION_ID=orgAId abaixo faz este
  // papel compartilhar deliberadamente o escopo legado com a Agência A.
  const legacyAdminUser = await prisma.user.create({ data: { email: 'legacy-admin@example.test', name: 'Operador legado', passwordHash, role: 'admin', legacyAccess: true } });

  const tripB = await prisma.trip.create({ data: {
    organizationId: orgBId, title: 'Viagem da Agência B', category: 'Teste', description: 'privado', city: 'Cidade', region: 'PB',
    startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]', storedIdentity: 'doc-e2e-trip-b',
  } });
  const tripLegacy = await prisma.trip.create({ data: {
    organizationId: null, title: 'Viagem do acervo legado', category: 'Teste', description: 'privado', city: 'Cidade', region: 'PB',
    startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]', storedIdentity: 'doc-e2e-trip-legacy',
  } });

  const apiPort = await unusedPort();
  vite = await createServer({ configFile: false, root: path.join(root, 'frontend'), plugins: [react()], server: {
    host: '127.0.0.1', port: 0, strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  }, logLevel: 'error' });
  await vite.listen();
  const frontendUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;

  const sharedEnv = {
    ...process.env, DATABASE_URL: dbUrl,
    DOCUMENT_STORAGE_DIR: documentsDir,
    DOCUMENT_PDFTOTEXT_PATH: REAL_PDFTOTEXT_PATH,
    DOCUMENT_CLAMDSCAN_PATH: scannerScript,
  };
  api = spawn(path.join(root, 'node_modules/.bin/tsx'), ['src/index.ts'], {
    cwd: root,
    env: { ...sharedEnv, HOST: '127.0.0.1', PORT: String(apiPort), CORS_ORIGIN: frontendUrl, NODE_ENV: 'test',
      UPLOADS_DIR: path.join(temporary, 'uploads'),
      // Compartilhamento deliberado: escopo legado passa a incluir a
      // Agência A, nunca a B nem todas as empresas.
      LEGACY_TOURISM_ORGANIZATION_ID: orgAId,
      // IA de sugestões deliberadamente NÃO habilitada: testamos o caminho
      // real de "desativada", nunca uma resposta de IA simulada.
      DOCUMENT_AI_EXTERNAL_ENABLED: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let apiErrors = '';
  api.stderr.on('data', chunk => { apiErrors += chunk.toString().slice(0, 2000); });
  await waitForApi(`http://127.0.0.1:${apiPort}`);

  // Worker REAL de extração, processo próprio — não é a mesma chamada de
  // função que a API usa; prova a esteira entre processos de verdade.
  worker = spawn(path.join(root, 'node_modules/.bin/tsx'), ['src/documentWorker.ts'], {
    cwd: root, env: sharedEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let workerErrors = '';
  worker.stderr.on('data', chunk => { workerErrors += chunk.toString().slice(0, 2000); });
  await delay(300);
  record('worker de extração real continua de pé após iniciar', worker.exitCode === null);

  browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const a = await contextA.newPage();
  debugPage = a;
  await login(a, frontendUrl, ownerA.email, 'Agência Documentos A');

  await a.getByRole('button', { name: 'Nova viagem' }).first().click();
  // Por id, não por rótulo: o formulário tem mais de um campo rotulado
  // "Cidade" (destino e ponto de encontro) — mesma solução já usada em
  // organization-trip-create.spec.ts.
  await a.locator('#org-trip-title').fill('Trilha do Mirante Real');
  await a.locator('#org-trip-category').fill('Trilha');
  await a.locator('#org-trip-city').fill('Areia');
  await a.locator('#org-trip-region').fill('PB');
  await a.locator('#org-trip-start').fill('2030-08-01T06:00');
  await a.locator('#org-trip-description').fill('Caminhada guiada até o mirante.');
  await a.getByRole('button', { name: 'Salvar' }).click();
  await a.getByRole('heading', { name: 'Trilha do Mirante Real' }).waitFor();
  const tripA = await prisma.trip.findFirstOrThrow({ where: { organizationId: orgAId, title: 'Trilha do Mirante Real' } });

  await a.getByRole('button', { name: 'Editar Trilha do Mirante Real' }).click();
  await a.getByRole('heading', { name: 'Editar viagem' }).waitFor();
  await a.getByText('PDFs do roteiro').waitFor();

  const pdfBuffer = buildRealPdf(SIMULATED_TEXT);
  await a.locator('#trip-document').setInputFiles({ name: 'roteiro-real.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
  await a.getByText('roteiro-real.pdf').waitFor();
  record('upload real grava metadado CLEAN (scanner simulado aprovando)', (await prisma.tripDocument.findFirstOrThrow({ where: { tripId: tripA.id } })).scanStatus === 'CLEAN');

  // Extração real: aguarda o worker (processo próprio) processar via
  // pdftotext real — nunca escrevemos o resultado nós mesmos.
  let ready = false;
  for (let i = 0; i < 20 && !ready; i++) {
    await a.getByRole('button', { name: 'Atualizar lista' }).click();
    ready = await a.getByText('Pronto para análise').isVisible().catch(() => false);
    if (!ready) await delay(1000);
  }
  record('worker real + pdftotext real deixaram o documento "Pronto para análise"', ready);

  const storedDocument = await prisma.tripDocument.findFirstOrThrow({ where: { tripId: tripA.id } });
  const extractedPages = await prisma.tripDocumentPage.findMany({ where: { documentId: storedDocument.id } });
  record('pdftotext real extraiu o texto exato do PDF enviado', extractedPages.some(p => p.text.includes(SIMULATED_TEXT)));
  record('arquivo físico real existe no storage temporário', await access(path.join(documentsDir, storedDocument.storageKey)).then(() => true, () => false));

  // Sugestões por IA: caminho real de "desativada" — nunca chamamos um
  // provedor de verdade nem simulamos uma resposta de IA.
  await a.getByRole('button', { name: 'Sugerir campos' }).click();
  await a.getByText('A análise de documentos por IA externa está desativada neste ambiente.').waitFor();
  record('endpoint de sugestões recusa de verdade quando a IA não está habilitada (nenhuma IA chamada)', true);

  const download = a.waitForEvent('download');
  await a.getByRole('button', { name: 'Baixar' }).click();
  const downloaded = await download;
  const downloadedPath = await downloaded.path();
  const { readFile } = await import('node:fs/promises');
  const downloadedBytes = await readFile(downloadedPath);
  record('download real devolve os mesmos bytes enviados', downloadedBytes.equals(pdfBuffer));

  // --- LEGACY_TOURISM_ORGANIZATION_ID: compartilhamento deliberado, nunca universal ---
  const legacyCtx = await browser.newContext();
  const legacyLogin = await legacyCtx.request.post(`${frontendUrl}/api/auth/login`, { data: { email: legacyAdminUser.email, password } });
  record('operador legado autentica normalmente', legacyLogin.ok());
  const legacySharedAccess = await legacyCtx.request.get(`${frontendUrl}/api/trips/${tripA.id}/documents`);
  record('LEGACY_TOURISM_ORGANIZATION_ID=A: operador legado VÊ o PDF real da Agência A (compartilhamento deliberado e documentado)', legacySharedAccess.status() === 200);
  const legacySharedBody = await legacySharedAccess.json();
  record('o documento devolvido ao operador legado é o mesmo documento real extraído (mesmo id)', Array.isArray(legacySharedBody) && legacySharedBody.some(d => d.id === storedDocument.id));
  const legacyDeniedB = await legacyCtx.request.get(`${frontendUrl}/api/trips/${tripB.id}/documents`);
  // 404, nunca 403: requireLegacyTripScope nunca revela que a viagem existe
  // fora do escopo legado (mesmo princípio do painel por empresa).
  record('operador legado NUNCA alcança a Agência B (não configurada): nunca é "todas as empresas"', legacyDeniedB.status() === 404);
  const legacyAllowedLegacyTrip = await legacyCtx.request.get(`${frontendUrl}/api/trips/${tripLegacy.id}/documents`);
  record('operador legado continua acessando o acervo legado nulo (organizationId null), como sempre', legacyAllowedLegacyTrip.status() === 200);

  // O painel da própria Agência A nunca passa a ver o acervo legado nulo,
  // mesmo sendo a empresa compartilhada por LEGACY_TOURISM_ORGANIZATION_ID:
  // o compartilhamento é só do lado do operador legado, nunca do painel da
  // empresa — isolamento do painel não é "relaxado" pela configuração.
  const panelStillStrictAgainstLegacyTrip = await a.request.get(`${frontendUrl}/api/organizations/${orgAId}/tourism/trips/${tripLegacy.id}/documents`);
  record('painel da Agência A nunca vê a viagem legada (organizationId null), mesmo sendo a empresa compartilhada', panelStillStrictAgainstLegacyTrip.status() === 404);

  const contextB = await browser.newContext();
  const bRequest = contextB.request;
  const loginB = await bRequest.post(`${frontendUrl}/api/auth/login`, { data: { email: ownerB.email, password } });
  record('OWNER da Agência B autentica normalmente', loginB.ok());
  const crossB = await bRequest.get(`${frontendUrl}/api/organizations/${orgAId}/tourism/trips/${tripA.id}/documents`);
  record('painel da Agência B nunca alcança o PDF real da Agência A', crossB.status() === 403 || crossB.status() === 404);

  // --- Exclusão real: metadado e arquivo físico, de verdade ---
  await a.getByRole('button', { name: 'Excluir' }).click();
  await a.getByRole('dialog', { name: 'Excluir documento?' }).getByRole('button', { name: 'Excluir', exact: true }).click();
  await a.getByText('Nenhum documento anexado.').waitFor();
  record('metadado real foi removido do banco', await prisma.tripDocument.findUnique({ where: { id: storedDocument.id } }) === null);
  record('arquivo físico real foi removido do storage', await access(path.join(documentsDir, storedDocument.storageKey)).then(() => false, () => true));

  await contextA.close();
  await legacyCtx.close();
  await contextB.close();

  limitations.push(
    'Antivírus (clamd) indisponível neste host: o scanner foi SIMULADO por um executável que sempre aprova. Nenhuma validação real de ClamAV ocorreu.',
    'Nenhum provedor de IA externo foi chamado (sem credencial/custo): só o caminho real de "IA desativada" foi exercido, nunca uma resposta de IA simulada.',
  );

  console.log('PASS: upload, worker real, pdftotext real, download, exclusão e o caso LEGACY_TOURISM_ORGANIZATION_ID (compartilhamento deliberado com a Agência A, nunca com a B, nunca "todas").');
  console.log(`Verificações (${checks.length}): ${checks.map(c => `✓ ${c.label}`).join(' | ')}`);
  console.log(`Limitações do ambiente: ${limitations.join(' ')}`);
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : 'falha desconhecida');
  console.error(`Verificações concluídas antes da falha (${checks.length}): ${checks.map(c => `${c.ok ? '✓' : '✗'} ${c.label}`).join(' | ')}`);
  if (debugPage && !debugPage.isClosed()) console.error('Tela de teste:', (await debugPage.locator('body').innerText().catch(() => '')).slice(0, 1500));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite?.close();
  for (const child of [api, worker]) {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  await prisma?.$disconnect();
  await rm(temporary, { recursive: true, force: true });
}
