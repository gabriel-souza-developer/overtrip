import { test, expect, type Browser } from '@playwright/test';
import { spawn, type ChildProcess, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { runExtractionProbe } from '../scripts/lib/sandboxCompatProbe';

// Ponta a ponta real (não page.route) da seleção de foto embutida em PDF por
// agência: API Node/Express e worker de documentos reais, em processos
// separados, com SQLite e armazenamento próprios e descartáveis — mesma
// convenção de organization-visit-gallery-real-api.spec.ts, estendida com um
// segundo processo (o worker) e com a extração real de imagens de PDF
// (bwrap + prlimit + systemd-run, ver src/services/pdfEmbeddedImages.ts).
//
// Cobre o que um mock nunca prova: o parser (pdfimages) e a sandbox de
// decodificação são reais; o antivírus (clamscan, sem daemon — ver
// beforeAll) roda de verdade sobre o PDF sintético; o worker, também real e
// em processo próprio, precisa extrair o texto (pdftotext) antes do botão
// "Ver fotos do PDF" aparecer; a foto importada é servida de volta pela
// rota autenticada por empresa, com pixels de verdade; e uma segunda
// empresa não alcança nem a foto nem o PDF de origem da primeira.
//
// Roda só com `npm run test:e2e:real:pdf-photo`. Fora dessa execução,
// test.skip abaixo impede qualquer spawn ou chamada de rede.
test.skip(process.env.E2E_REAL_API !== '1', 'Requer `npm run test:e2e:real:pdf-photo` — API e worker reais isolados, fora do conjunto padrão.');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_PORT = Number(process.env.E2E_API_PORT || 3502);
const PASSWORD = 'senha-segura';
const AUTHENTICATED_PREVIEW_PATH = /^\/api\/organizations\/[^/]+\/tourism\/media\//;

let backend: ChildProcess | undefined;
let worker: ChildProcess | undefined;
let prisma: PrismaClient;
let tmpRoot: string;
let sharedEnv: NodeJS.ProcessEnv;

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function waitForHealth(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/health`);
      if (res.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API real não respondeu em http://127.0.0.1:${API_PORT}/health a tempo.`);
}

function killGroup(proc: ChildProcess | undefined, signal: NodeJS.Signals) {
  if (!proc || proc.pid === undefined) return;
  // Mesmo motivo de organization-visit-gallery-real-api.spec.ts: tsx reexeca
  // num processo filho; mata pelo grupo (PID negativo), nunca só o spawn().
  try { process.kill(-proc.pid, signal); } catch { /* grupo já encerrado */ }
}

async function stopProcess(proc: ChildProcess | undefined): Promise<void> {
  if (!proc) return;
  killGroup(proc, 'SIGTERM');
  await new Promise((resolve) => { proc.once('exit', resolve); setTimeout(resolve, 3000); });
  if (proc.exitCode === null) killGroup(proc, 'SIGKILL');
}

async function createOrgWithOwner(slug: string, name: string, ownerEmail: string, passwordHash: string) {
  const organization = await prisma.organization.create({ data: { name, slug, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: ownerEmail, passwordHash, name: `Dona ${name}`, legacyAccess: false } });
  await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' } });
  return { organization, user };
}

let orgA: Awaited<ReturnType<typeof createOrgWithOwner>>;
let orgB: Awaited<ReturnType<typeof createOrgWithOwner>>;

/**
 * PDF sintético com UMA imagem embutida (JPEG, DCTDecode) e um pouco de
 * texto de verdade na página. O texto não é cosmético: sem ele,
 * extractNextDocument (documentExtraction.ts) recebe uma página vazia do
 * pdftotext e marca a extração como FAILED (NO_TEXT) — e a UI só mostra "Ver
 * fotos do PDF" quando extractionStatus é READY. Nenhum dado real, nenhuma
 * foto de pessoa: tudo gerado em memória a cada execução.
 */
async function buildSyntheticRoteiroPdf(): Promise<Buffer> {
  const width = 64;
  const height = 48;
  const jpeg = await sharp({ create: { width, height, channels: 3, background: '#4477aa' } }).jpeg().toBuffer();
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let size = chunks[0].length;
  const add = (value: Buffer | string) => {
    const part = Buffer.isBuffer(value) ? value : Buffer.from(value);
    chunks.push(part);
    size += part.length;
  };
  const object = (index: number, content: Buffer | string) => {
    offsets[index] = size;
    add(`${index} 0 obj\n`);
    add(content);
    add('\nendobj\n');
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`);
  object(4, Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    Buffer.from('\nendstream'),
  ]));
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\nBT /F1 10 Tf 2 2 Td (Roteiro da viagem sintetico) Tj ET`;
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  object(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const xref = size;
  add('xref\n0 7\n0000000000 65535 f \n');
  for (let i = 1; i <= 6; i += 1) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

test.beforeAll(async () => {
  // Diagnóstico explícito ANTES de qualquer spawn: nunca falseia passagem.
  // Mesma sonda real (pdfimages + bwrap + prlimit + systemd-run reais) usada
  // pelo operador para validar o host de produção — ver
  // docs/SANDBOX_COMPAT_CHECK.md. Se o host não tiver namespace/cgroup
  // disponível (ou faltar algum binário), a suíte inteira falha aqui, com o
  // estágio e o código exatos, em vez de pular silenciosamente ou de deixar
  // um teste mais adiante falhar de um jeito confuso.
  const sandboxCheck = await runExtractionProbe({
    bwrapPath: '/usr/bin/bwrap', limiterPath: '/usr/bin/prlimit',
    systemdRunPath: '/usr/bin/systemd-run', pdfimagesPath: '/usr/bin/pdfimages', timeoutMs: 15_000,
  });
  if (!sandboxCheck.ok) {
    throw new Error(
      `Ambiente sem a sandbox real de extração de imagens de PDF — a suíte não finge que passou. ` +
      `Estágio: ${sandboxCheck.stage}, código: ${sandboxCheck.code}, detalhe: ${sandboxCheck.message}. ` +
      `Provável causa: bwrap/prlimit/systemd-run ausentes, ou sem permissão para criar namespace de usuário ` +
      `(cgroup/systemd indisponível) neste host — ver docs/SANDBOX_COMPAT_CHECK.md.`
    );
  }

  const free = await portIsFree(API_PORT);
  if (!free) throw new Error(`Porta ${API_PORT} já está em uso — escolha outra via E2E_API_PORT; este teste nunca reaproveita um servidor já rodando.`);

  tmpRoot = mkdtempSync(path.join(tmpdir(), 'overtrip-e2e-pdf-photo-'));
  const dbPath = path.join(tmpRoot, 'e2e.db');
  const uploadsDir = path.join(tmpRoot, 'uploads');
  const documentsDir = path.join(tmpRoot, 'documents');
  const databaseUrl = `file:${dbPath}`;

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: REPO_ROOT, stdio: 'pipe', env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  orgA = await createOrgWithOwner('real-pdf-a', 'Agência PDF A', 'owner-pdf-a@example.test', passwordHash);
  orgB = await createOrgWithOwner('real-pdf-b', 'Agência PDF B', 'owner-pdf-b@example.test', passwordHash);

  sharedEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    UPLOADS_DIR: uploadsDir,
    DOCUMENT_STORAGE_DIR: documentsDir,
    // clamd (o daemon) não está ativo neste host (ver beforeAll do probe
    // acima, que não testa isto): usar clamscan autônomo em vez de
    // clamdscan continua sendo uma varredura REAL de antivírus — mesmo
    // binário, mesmos códigos de saída, só sem precisar de um daemon de
    // fundo. Scanner indisponível de verdade também é um resultado válido
    // para este teste (a tarefa permite simulá-lo assim); aqui preferimos o
    // real porque o host tem a base de vírus instalada.
    DOCUMENT_CLAMDSCAN_PATH: '/usr/bin/clamscan',
    DOCUMENT_PDFTOTEXT_PATH: '/usr/bin/pdftotext',
    DOCUMENT_PDF_IMAGE_EXTRACTION_ENABLED: 'true',
    DOCUMENT_PDFIMAGES_PATH: '/usr/bin/pdfimages',
    // Provedor de IA deliberadamente ausente: a seleção de foto de PDF não
    // depende dele (ver POST .../images e .../images/:index/import, que
    // nunca chamam generateDocumentSuggestions), e a tarefa não pede para
    // testar sugestões por IA.
    DOCUMENT_AI_EXTERNAL_ENABLED: 'false',
    PORT: String(API_PORT),
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://127.0.0.1:4300',
  };

  backend = spawn('npx', ['tsx', 'src/index.ts'], { cwd: REPO_ROOT, detached: true, env: sharedEnv, stdio: 'pipe' });
  backend.stderr?.on('data', (chunk) => { if (backend) process.stderr.write(`[api-real] ${chunk}`); });
  await waitForHealth();

  worker = spawn('npx', ['tsx', 'src/documentWorker.ts'], { cwd: REPO_ROOT, detached: true, env: sharedEnv, stdio: 'pipe' });
  worker.stderr?.on('data', (chunk) => { if (worker) process.stderr.write(`[document-worker-real] ${chunk}`); });
  worker.on('exit', (code) => { if (worker && code !== null && code !== 0) process.stderr.write(`[document-worker-real] saiu com código ${code}\n`); });
});

test.afterAll(async () => {
  const b = backend; backend = undefined;
  const w = worker; worker = undefined;
  await Promise.all([stopProcess(b), stopProcess(w)]);
  await prisma?.$disconnect();
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

async function login(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/[^/]+\/dashboard$/);
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/[^/]+\/trips$/);
  return { context, page };
}

async function createDraftTrip(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: 'Nova viagem' }).first().click();
  await page.locator('#org-trip-title').fill(title);
  await page.locator('#org-trip-category').fill('Trilha');
  await page.locator('#org-trip-city').fill('Lucena');
  await page.locator('#org-trip-region').fill('PB');
  await page.locator('#org-trip-start').fill('2030-06-01T09:00');
  await page.locator('#org-trip-description').fill('Roteiro real de ponta a ponta.');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(page.getByText(title)).toBeVisible();
}

async function openEditAndUploadPdf(page: import('@playwright/test').Page, title: string, pdf: Buffer) {
  await page.getByRole('button', { name: `Editar ${title}` }).click();
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toBeVisible();
  await page.locator('#trip-document').setInputFiles({ name: 'roteiro.pdf', mimeType: 'application/pdf', buffer: pdf });
  // clamscan sem daemon carrega a base de vírus do zero a cada chamada:
  // mais lento que um mock, de propósito (é a varredura real).
  await expect(page.getByText('roteiro.pdf')).toBeVisible({ timeout: 20_000 });
}

/**
 * TripDocuments.tsx só relê a lista (e portanto o extractionStatus) depois
 * de uma ação própria (upload, exclusão, sugestões) ou de "Atualizar
 * lista" — nunca por conta própria enquanto a pessoa espera. O worker real
 * (processo próprio) normalmente termina em menos de 2s, mas sem clicar em
 * "Atualizar lista" a tela nunca mostraria isso, mesmo esperando bem mais —
 * é o comportamento real do produto, não uma falha da sandbox. Replica
 * exatamente o que uma pessoa faria: clica em "Atualizar lista" aos poucos
 * até o rótulo mudar.
 */
async function waitForExtractionReady(page: import('@playwright/test').Page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.getByText('Pronto para análise').isVisible()) return;
    const refreshButton = page.getByRole('button', { name: 'Atualizar lista' });
    if (await refreshButton.isEnabled()) await refreshButton.click();
    await page.waitForTimeout(1000);
  }
  await expect(page.getByText('Pronto para análise')).toBeVisible({ timeout: 1000 });
}

test('agência vê a prévia, escolhe a foto, exige texto alternativo, importa, salva e reabre com a foto autenticada', async ({ browser }) => {
  test.setTimeout(90_000);
  const { context, page } = await login(browser, 'owner-pdf-a@example.test');
  try {
    const title = 'Trilha com roteiro em PDF';
    await createDraftTrip(page, title);

    // Antes de importar nada, nenhuma viagem desta empresa tem foto — e a
    // própria viagem acabou de ser criada sem mídia (confirma a linha de
    // base antes de provar, mais abaixo, que a importação não publica nada
    // por conta própria).
    const createdTrip = await prisma.trip.findFirst({ where: { organizationId: orgA.organization.id, title } });
    expect(createdTrip).not.toBeNull();
    expect(JSON.parse(createdTrip!.media || '[]')).toEqual([]);

    await openEditAndUploadPdf(page, title, await buildSyntheticRoteiroPdf());
    await waitForExtractionReady(page);

    await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
    await expect(page.getByText('Fotos encontradas no PDF')).toBeVisible();
    const thumb = page.getByRole('button', { name: /Selecionar foto da página 1/ });
    await expect(thumb).toHaveCount(1);
    await thumb.click();

    // Exige texto alternativo: campo em foco, botão desabilitado até haver texto.
    const altInput = page.getByLabel('O que aparece nesta foto? (obrigatório)');
    await expect(altInput).toBeFocused();
    const importButton = page.getByRole('button', { name: 'Importar esta foto' });
    await expect(importButton).toBeDisabled();
    await altInput.fill('Grupo na trilha, foto do roteiro');
    await expect(importButton).toBeEnabled();

    // Importa — ainda SEM salvar a viagem. Nada no banco deve ter mudado:
    // prova direta de que a importação só preenche o formulário em memória,
    // nunca publica ou salva a viagem por conta própria.
    await importButton.click();
    await expect(page.locator('#org-trip-form img.shrink-0[alt="Grupo na trilha, foto do roteiro"]')).toHaveCount(1);
    const stillUnsaved = await prisma.trip.findUnique({ where: { id: createdTrip!.id } });
    expect(JSON.parse(stillUnsaved!.media || '[]')).toEqual([]);

    // A foto JÁ está autenticada por empresa (mesma rota usada pelo envio
    // comum) e carrega pixels de verdade, mesmo antes de salvar a viagem.
    const importedThumb = page.locator('#org-trip-form img.shrink-0[alt="Grupo na trilha, foto do roteiro"]');
    await expect(importedThumb).toHaveAttribute('src', AUTHENTICATED_PREVIEW_PATH);
    await expect.poll(() => importedThumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    const previewSrc = await importedThumb.getAttribute('src') as string;

    // Salva agora, de propósito — só a partir daqui a viagem deve ter a foto.
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar viagem' })).toHaveCount(0);
    const savedTrip = await prisma.trip.findUnique({ where: { id: createdTrip!.id } });
    const savedMedia = JSON.parse(savedTrip!.media || '[]');
    expect(savedMedia).toHaveLength(1);
    expect(savedMedia[0].alt).toBe('Grupo na trilha, foto do roteiro');

    // Reabre (carregamento de página novo, não só estado em memória) e
    // confirma que a foto persistiu e continua carregando pela rota
    // autenticada, com o mesmo caminho de antes.
    await page.reload();
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole('button', { name: `Editar ${title}` }).click();
    await expect(page.getByRole('heading', { name: 'Editar viagem' })).toBeVisible();
    const reopenedThumb = page.locator('#org-trip-form img.shrink-0[alt="Grupo na trilha, foto do roteiro"]');
    await expect(reopenedThumb).toHaveAttribute('src', previewSrc);
    await expect.poll(() => reopenedThumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test('descartar o formulário sem salvar não deixa a foto importada na viagem', async ({ browser }) => {
  test.setTimeout(90_000);
  const { context, page } = await login(browser, 'owner-pdf-a@example.test');
  try {
    const title = 'Trilha para descartar';
    await createDraftTrip(page, title);
    const trip = await prisma.trip.findFirst({ where: { organizationId: orgA.organization.id, title } });

    await openEditAndUploadPdf(page, title, await buildSyntheticRoteiroPdf());
    await waitForExtractionReady(page);
    await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
    await page.getByRole('button', { name: /Selecionar foto da página 1/ }).click();
    await page.getByLabel('O que aparece nesta foto? (obrigatório)').fill('Foto que será descartada');
    await page.getByRole('button', { name: 'Importar esta foto' }).click();
    await expect(page.locator('#org-trip-form img.shrink-0[alt="Foto que será descartada"]')).toHaveCount(1);

    // Fecha sem salvar: formulário sujo (a foto importada conta como
    // alteração), pergunta antes de descartar — mesmo comportamento já
    // coberto por organization-trip-discard-confirmation.spec.ts, aqui com
    // dados reais em vez de mock.
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toBeVisible();
    await page.getByRole('button', { name: 'Descartar alterações' }).click();
    await expect(page.getByRole('heading', { name: 'Editar viagem' })).toHaveCount(0);

    const stillClean = await prisma.trip.findUnique({ where: { id: trip!.id } });
    expect(JSON.parse(stillClean!.media || '[]')).toEqual([]);
  } finally {
    await context.close();
  }
});

test('isolamento entre empresas: a empresa B não alcança a foto nem o PDF de origem da empresa A', async ({ browser }) => {
  test.setTimeout(90_000);
  const ownerA = await login(browser, 'owner-pdf-a@example.test');
  let photoUrl: string;
  let tripIdOfA: string;
  try {
    const title = 'Trilha exclusiva da empresa A';
    await createDraftTrip(ownerA.page, title);
    const trip = await prisma.trip.findFirst({ where: { organizationId: orgA.organization.id, title } });
    tripIdOfA = trip!.id;

    await openEditAndUploadPdf(ownerA.page, title, await buildSyntheticRoteiroPdf());
    await waitForExtractionReady(ownerA.page);
    await ownerA.page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
    await ownerA.page.getByRole('button', { name: /Selecionar foto da página 1/ }).click();
    await ownerA.page.getByLabel('O que aparece nesta foto? (obrigatório)').fill('Foto exclusiva da empresa A');
    await ownerA.page.getByRole('button', { name: 'Importar esta foto' }).click();
    const importedThumb = ownerA.page.locator('#org-trip-form img.shrink-0[alt="Foto exclusiva da empresa A"]');
    photoUrl = await importedThumb.getAttribute('src') as string;
    expect(photoUrl).toMatch(AUTHENTICATED_PREVIEW_PATH);
  } finally {
    await ownerA.context.close();
  }

  const ownerB = await login(browser, 'owner-pdf-b@example.test');
  try {
    await expect(ownerB.page.getByText('Nenhuma viagem cadastrada')).toBeVisible();
    await expect(ownerB.page.getByText('Trilha exclusiva da empresa A')).toHaveCount(0);

    // Com a sessão da empresa B, baixar diretamente a foto importada pela
    // empresa A é negado.
    const photoStatus = await ownerB.page.evaluate(async (url) => (await fetch(url)).status, photoUrl);
    expect(photoStatus).toBeGreaterThanOrEqual(400);
    expect(photoStatus).toBeLessThan(500);

    // E a própria rota de documentos da viagem de A, sob o caminho da
    // empresa B, nunca resolve — nem a listagem revela que o PDF existe.
    const documentsStatus = await ownerB.page.evaluate(
      async ({ orgId, tripId }) => (await fetch(`/api/organizations/${orgId}/tourism/trips/${tripId}/documents`, { credentials: 'same-origin' })).status,
      { orgId: orgB.organization.id, tripId: tripIdOfA },
    );
    expect(documentsStatus).toBe(404);
  } finally {
    await ownerB.context.close();
  }
});
