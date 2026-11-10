import { expect, test, type Page, type Route } from '@playwright/test';
import sharp from 'sharp';

const SHOTS = '/tmp/claude-1000/-meus-arquivos-projetos-dev-overtrip-v6/d569ae9f-d81c-4a67-9d22-9d8ebbe5edfd/scratchpad/agente-imagens';
const KEY = '0123456789abcdef0123456789abcdef';
const SRC = `/api/public/media/${KEY}.jpg`;

let photo: Buffer;
test.beforeAll(async () => {
  photo = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#E26B1B' } }).jpeg().toBuffer();
});

type Handler = (route: Route, url: URL) => Promise<unknown> | unknown;

/** Simula só a API: o filtro pelo início do caminho não captura /src/api/index.ts do Vite. */
async function mockApi(page: Page, overrides: Record<string, Handler> = {}) {
  const uploads: { contentType: string | null; bytes: number }[] = [];
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (overrides[key]) return overrides[key](route, url);
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: { id: 'u1', email: 'p@example.test', name: 'Playwright', role: 'editor' } });
    if (url.pathname.startsWith('/api/public/media/')) return route.fulfill({ contentType: 'image/jpeg', body: photo });
    if (key === 'POST /api/media') {
      uploads.push({ contentType: route.request().headers()['content-type'] ?? null, bytes: route.request().postDataBuffer()?.length ?? 0 });
      return route.fulfill({ status: 201, json: {
        id: 'm1', src: SRC, mimeType: 'image/jpeg', width: 320, height: 200, sizeBytes: photo.length,
        variants: [640, 960, 1280].map((w) => ({ width: w, src: SRC.replace('.jpg', `-w${w}.webp`) })),
      } });
    }
    if (url.pathname === '/api/settings/trip-presentation') return route.fulfill({ json: { buttonLabel: 'Quero viajar', buttonClass: 'button-dark', priceUnit: 'por pessoa' } });
    if (url.pathname === '/api/ai/status') return route.fulfill({ json: { enabled: false } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } } });
  });
  return uploads;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'playwright-test-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'p@example.test', name: 'Playwright', role: 'editor' }));
  });
});

async function openTripPhotos(page: Page) {
  await page.goto('/trips/new');
  await expect(page.getByText('Enviar foto')).toBeVisible();
}

test('envia foto do computador, mostra prévia e exige texto alternativo', async ({ page }) => {
  const uploads = await mockApi(page);
  await openTripPhotos(page);

  await page.locator('#media-link-upload-file').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: photo });
  const alt = page.getByLabel('O que aparece nesta foto? (obrigatório)');
  await expect(alt).toBeFocused();
  await expect(page.getByText('Foto enviada. Conte o que aparece nela e clique em “Usar esta foto”.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar viagem' })).toBeDisabled();
  const add = page.getByRole('button', { name: 'Usar esta foto' });
  await expect(add).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/painel-upload-alt.png`, fullPage: false });

  await alt.fill('Grupo na beira da cachoeira');
  await add.click();
  await expect(page.getByText('Foto adicionada ao formulário. Salve para confirmar a alteração.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar viagem' })).toBeEnabled();
  await page.getByRole('button', { name: 'Alterar endereço da foto' }).click();
  await expect(page.getByLabel('Endereço da foto 1')).toHaveValue(SRC);
  await expect(page.getByLabel('O que aparece na foto 1? (obrigatório)')).toHaveValue('Grupo na beira da cachoeira');
  expect(uploads).toEqual([{ contentType: 'image/jpeg', bytes: photo.length }]);

  // Apagar a descrição de uma foto enviada impede salvar, com mensagem clara.
  await page.getByLabel('O que aparece na foto 1? (obrigatório)').fill('');
  await page.getByRole('button', { name: 'Salvar viagem' }).click();
  await expect(page.locator('p.field-error', { hasText: 'Descreva a foto enviada (texto alternativo obrigatório).' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/painel-upload-lista.png`, fullPage: true });
});

test('cola imagem da área de transferência e mostra o progresso', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await mockApi(page, {
    'POST /api/media': async (route) => {
      await held;
      await route.fulfill({ status: 201, json: { id: 'm2', src: SRC, mimeType: 'image/jpeg', width: 320, height: 200, sizeBytes: 1, variants: [] } });
    },
  });
  await openTripPhotos(page);

  const zone = page.getByRole('textbox', { name: 'Colar imagem da área de transferência' });
  await zone.click();
  await zone.evaluate((el, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...photo]);

  await expect(page.locator('#media-link-upload-progress')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar viagem' })).toBeDisabled();
  await expect(page.getByText(/Enviando foto… \d+%/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/painel-upload-progresso.png` });
  release();
  await expect(page.getByLabel('O que aparece nesta foto? (obrigatório)')).toBeVisible();
});

test('mostra erro claro para formato não aceito e para recusa do servidor', async ({ page }) => {
  await mockApi(page, {
    'POST /api/media': (route) => route.fulfill({ status: 413, json: { error: 'A imagem é grande demais (9000×9000). Use até 8000 px de lado.' } }),
  });
  await openTripPhotos(page);

  await page.locator('#media-link-upload-file').setInputFiles({ name: 'foto.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.getByRole('alert').filter({ hasText: 'Formato não aceito. Envie uma foto JPEG, PNG ou WebP.' })).toBeVisible();

  await page.locator('#media-link-upload-file').setInputFiles({ name: 'grande.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByRole('alert').filter({ hasText: 'A imagem é grande demais (9000×9000)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar viagem' })).toBeEnabled();
  await page.getByTestId("media-link-upload-uploader").screenshot({ path: `${SHOTS}/painel-upload-erro.png` });
});

test('galeria aceita foto enviada no lugar do link', async ({ page }) => {
  await mockApi(page);
  await page.goto('/gallery');
  await page.getByRole('button', { name: 'Nova memória' }).first().click();
  await page.locator('#g-upload-file').setInputFiles({ name: 'x.webp', mimeType: 'image/webp', buffer: photo });
  await expect(page.getByRole('button', { name: 'Criar memória' })).toBeDisabled();
  await page.getByLabel('O que aparece nesta foto? (obrigatório)').fill('Pôr do sol no mirante');
  await page.getByRole('button', { name: 'Usar esta foto' }).click();
  await expect(page.getByRole('button', { name: 'Criar memória' })).toBeEnabled();
  await page.getByRole('button', { name: 'Alterar endereço da foto' }).click();
  await expect(page.getByLabel('Endereço da foto 1')).toHaveValue(SRC);
  await expect(page.getByLabel('O que aparece na foto 1? (obrigatório)')).toHaveValue('Pôr do sol no mirante');
  await page.screenshot({ path: `${SHOTS}/painel-upload-galeria.png` });
});
