import { test, expect, type Browser } from '@playwright/test';
import { spawn, type ChildProcess, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

// Único teste e2e deste repositório que fala com uma API Node/Express e um
// SQLite reais (não page.route) — tudo isolado nesta execução: banco e pasta
// de uploads próprios, apagados ao final. Nunca toca prisma/dev.db nem
// prisma/test.db (usado pelo vitest). Cobre o que um mock não pode garantir:
// a miniatura e a prévia de edição carregam de fato uma foto autenticada
// (cookie de sessão real), a galeria aceita e devolve cinco fotos de ponta a
// ponta, e uma empresa não vê nem consegue baixar a foto de outra.
//
// Roda só com `npm run test:e2e:real` (define E2E_REAL_API e aponta o proxy
// do Vite — ver vite.config.ts — para a porta isolada abaixo). Fora dessa
// execução, test.skip abaixo impede qualquer spawn ou chamada de rede: o
// conjunto padrão (`npm run test:e2e`) nunca arrisca cair na API real da
// porta 3001 de um `npm run dev` que esteja rodando ao lado.
test.skip(process.env.E2E_REAL_API !== '1', 'Requer `npm run test:e2e:real` — API real isolada, fora do conjunto padrão.');

const REPO_ROOT = path.resolve(__dirname, '..');
const API_PORT = Number(process.env.E2E_API_PORT || 3501);
const PASSWORD = 'senha-segura';
// Cada entidade tem sua própria sub-rota de prévia autenticada
// (organizationVisitRoutes.ts usa .../tourism/visits/media/..., organizationGalleryRoutes.ts
// usa .../tourism/gallery/media/..., e o upload isolado em organizationMediaRoutes.ts usa
// .../tourism/media/... antes de a foto virar parte de um registro) — todas sob
// /api/organizations/<id>/tourism/, nunca o caminho público /api/public/media/.
const AUTHENTICATED_PREVIEW_PATH = /^\/api\/organizations\/[^/]+\/tourism\//;

let backend: ChildProcess | undefined;
let prisma: PrismaClient;
let tmpRoot: string;

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

async function createOrgWithOwner(slug: string, name: string, ownerEmail: string, passwordHash: string) {
  const organization = await prisma.organization.create({ data: { name, slug, status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { email: ownerEmail, passwordHash, name: `Dona ${name}`, legacyAccess: false } });
  await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' } });
  return { organization, user };
}

let orgA: Awaited<ReturnType<typeof createOrgWithOwner>>;
let orgB: Awaited<ReturnType<typeof createOrgWithOwner>>;

test.beforeAll(async () => {
  const free = await portIsFree(API_PORT);
  if (!free) throw new Error(`Porta ${API_PORT} já está em uso — escolha outra via E2E_API_PORT; este teste nunca reaproveita um servidor já rodando, para não arriscar dados reais.`);

  tmpRoot = mkdtempSync(path.join(tmpdir(), 'overtrip-e2e-real-'));
  const dbPath = path.join(tmpRoot, 'e2e.db');
  const uploadsDir = path.join(tmpRoot, 'uploads');
  const databaseUrl = `file:${dbPath}`;

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: REPO_ROOT, stdio: 'pipe', env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  orgA = await createOrgWithOwner('real-a', 'Agência Real A', 'owner-a@example.test', passwordHash);
  orgB = await createOrgWithOwner('real-b', 'Agência Real B', 'owner-b@example.test', passwordHash);

  // `detached: true` + matar pelo grupo de processos (PID negativo): o CLI
  // do tsx reexeca com flags --require/--import num processo filho; matar só
  // o processo original de spawn() deixa esse filho órfão (reparentado ao
  // systemd --user) e preso na porta, sem o `npx` nem a `tsx` em volta para
  // reagir ao sinal — foi exatamente isto que aconteceu numa tentativa
  // anterior e exigiu matar o processo órfão manualmente antes de seguir.
  backend = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: REPO_ROOT,
    detached: true,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      UPLOADS_DIR: uploadsDir,
      PORT: String(API_PORT),
      NODE_ENV: 'development',
      // Precisa bater com a origem que o Vite serve para o Playwright
      // (baseURL do playwright.config.ts): cookies de sessão em operações de
      // escrita só são aceitos quando Origin == CORS_ORIGIN (ver auth.ts).
      CORS_ORIGIN: 'http://127.0.0.1:4300',
    },
    stdio: 'pipe',
  });
  backend.stderr?.on('data', (chunk) => { if (!backend) return; process.stderr.write(`[api-real] ${chunk}`); });
  await waitForHealth();
});

test.afterAll(async () => {
  if (backend) {
    const proc = backend; backend = undefined;
    const killGroup = (signal: NodeJS.Signals) => { try { process.kill(-(proc.pid as number), signal); } catch { /* grupo já encerrado */ } };
    killGroup('SIGTERM');
    await new Promise((resolve) => { proc.once('exit', resolve); setTimeout(resolve, 3000); });
    if (proc.exitCode === null) killGroup('SIGKILL');
  }
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
  return { context, page };
}

async function photoBuffer(hex: string) {
  return sharp({ create: { width: 320, height: 200, channels: 3, background: hex } }).jpeg().toBuffer();
}

async function uploadVisitPhoto(page: import('@playwright/test').Page, buffer: Buffer, alt: string, name: string) {
  await page.locator('#org-visit-photo-file').setInputFiles({ name, mimeType: 'image/jpeg', buffer });
  const altInput = page.getByLabel('O que aparece nesta foto? (obrigatório)');
  await expect(altInput).toBeFocused();
  await altInput.fill(alt);
  await page.getByRole('button', { name: 'Usar esta foto' }).click();
}

test('cria um destino com foto real, abre a edição com a prévia autenticada carregada, salva e reabre', async ({ browser }) => {
  const { context, page } = await login(browser, 'owner-a@example.test');
  try {
    await page.getByRole('link', { name: 'Destinos visitados', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/empresa/${orgA.organization.id}/visits$`));
    await expect(page.getByText('Nenhum destino encontrado')).toBeVisible();

    await page.getByRole('button', { name: 'Novo destino' }).first().click();
    await page.getByLabel('Título').fill('Praia do Coqueirinho');
    await page.getByLabel('Cidade').fill('Cabedelo');
    await page.getByLabel('Estado').fill('PB');
    await uploadVisitPhoto(page, await photoBuffer('#2b6cb0'), 'Vista da praia', 'praia.jpg');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Novo destino' })).toHaveCount(0);
    await expect(page.getByText('Praia do Coqueirinho')).toBeVisible();

    // Miniatura da lista: aponta para a rota autenticada da própria empresa
    // (nunca o caminho público) e carrega pixels reais — não um 403/404.
    const listThumb = page.locator('img[alt="Vista da praia"]');
    await expect(listThumb).toHaveAttribute('src', AUTHENTICATED_PREVIEW_PATH);
    await expect.poll(() => listThumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Editar Praia do Coqueirinho' }).click();
    await expect(page.getByRole('heading', { name: 'Editar destino' })).toBeVisible();
    const editThumb = page.locator('#org-visit-form img[alt="Vista da praia"]');
    await expect(editThumb).toHaveAttribute('src', AUTHENTICATED_PREVIEW_PATH);
    await expect.poll(() => editThumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await page.locator('#org-visit-description').fill('Atualizado na edição com foto real.');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar destino' })).toHaveCount(0);

    // Reabre (nova carga de página, não apenas estado em memória) e confirma
    // que a foto e a descrição persistiram de fato no banco.
    await page.reload();
    await expect(page.getByText('Praia do Coqueirinho')).toBeVisible();
    await page.getByRole('button', { name: 'Editar Praia do Coqueirinho' }).click();
    await expect(page.locator('#org-visit-description')).toHaveValue('Atualizado na edição com foto real.');
    const reopenedThumb = page.locator('#org-visit-form img[alt="Vista da praia"]');
    await expect.poll(() => reopenedThumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test('galeria aceita cinco fotos reais de ponta a ponta e as mantém todas ao reabrir', async ({ browser }) => {
  const { context, page } = await login(browser, 'owner-a@example.test');
  try {
    await page.getByRole('link', { name: 'Galeria de memórias', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/empresa/${orgA.organization.id}/gallery$`));

    await page.getByRole('button', { name: 'Nova memória' }).first().click();
    await page.getByLabel('Título').fill('Trilha com cinco fotos');
    await page.locator('#org-gallery-date').fill('2030-02-10');
    await page.getByLabel('Descrição').fill('Dia inteiro de trilha, registrado em cinco fotos.');

    const colors = ['#2b6cb0', '#2f855a', '#b7791f', '#9b2c2c', '#553c9a'];
    for (let i = 0; i < colors.length; i += 1) {
      await page.locator('#org-gallery-photo-file').setInputFiles({ name: `foto-${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: await photoBuffer(colors[i]) });
      await page.getByLabel('O que aparece nesta foto? (obrigatório)').fill(`Foto ${i + 1}`);
      await page.getByRole('button', { name: 'Usar esta foto' }).click();
    }
    // Com cinco fotos, o campo de envio desaparece: o limite de 5 é o mesmo
    // dos dois lados (frontend e organizationGalleryRoutes.ts) — um dos bugs
    // já corrigidos (leitura limitava a 1, escrita a 5).
    await expect(page.locator('#org-gallery-photo-file')).toHaveCount(0);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Nova memória' })).toHaveCount(0);
    await expect(page.getByText('Trilha com cinco fotos')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Editar Trilha com cinco fotos' }).click();
    await expect(page.getByRole('heading', { name: 'Editar memória' })).toBeVisible();
    for (let i = 0; i < colors.length; i += 1) {
      const thumb = page.locator(`#org-gallery-form img[alt="Foto ${i + 1}"]`);
      await expect(thumb).toHaveCount(1);
      await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
    // No limite, o formulário não oferece enviar uma sexta foto.
    await expect(page.locator('#org-gallery-photo-file')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('isolamento entre empresas: a empresa B não vê nem consegue baixar a foto da empresa A', async ({ browser }) => {
  const ownerA = await login(browser, 'owner-a@example.test');
  let photoUrl: string;
  try {
    await ownerA.page.getByRole('link', { name: 'Destinos visitados', exact: true }).click();
    await ownerA.page.getByRole('button', { name: 'Novo destino' }).first().click();
    await ownerA.page.getByLabel('Título').fill('Destino exclusivo da empresa A');
    await ownerA.page.getByLabel('Cidade').fill('Lucena');
    await ownerA.page.getByLabel('Estado').fill('PB');
    await uploadVisitPhoto(ownerA.page, await photoBuffer('#1a365d'), 'Foto exclusiva da empresa A', 'exclusiva-a.jpg');
    await ownerA.page.getByRole('button', { name: 'Salvar' }).click();
    await expect(ownerA.page.getByRole('heading', { name: 'Novo destino' })).toHaveCount(0);
    photoUrl = await ownerA.page.locator('img[alt="Foto exclusiva da empresa A"]').getAttribute('src') as string;
    expect(photoUrl).toMatch(AUTHENTICATED_PREVIEW_PATH);
  } finally {
    await ownerA.context.close();
  }

  const ownerB = await login(browser, 'owner-b@example.test');
  try {
    await ownerB.page.getByRole('link', { name: 'Destinos visitados', exact: true }).click();
    await expect(ownerB.page).toHaveURL(new RegExp(`/empresa/${orgB.organization.id}/visits$`));
    // A lista da empresa B não mostra o destino da empresa A.
    await expect(ownerB.page.getByText('Nenhum destino encontrado')).toBeVisible();
    await expect(ownerB.page.getByText('Destino exclusivo da empresa A')).toHaveCount(0);

    // Com a sessão da empresa B, baixar diretamente a foto da empresa A é negado.
    const status = await ownerB.page.evaluate(async (url) => (await fetch(url)).status, photoUrl);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  } finally {
    await ownerB.context.close();
  }
});
