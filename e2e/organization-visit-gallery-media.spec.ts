import { expect, test, type Page, type Route } from '@playwright/test';
import sharp from 'sharp';

// Cobre a escrita de destinos visitados e da galeria no painel de empresa,
// incluindo o envio de foto isolado por organizationId (rota nova:
// /api/organizations/:id/tourism/media) — mesma convenção de mock de
// organization-trip-create.spec.ts e media-upload.spec.ts.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const KEY = 'abcdef0123456789abcdef0123456789';
const PUBLIC_SRC = `/api/public/media/${KEY}.jpg`;
const PREVIEW_SRC = `/api/organizations/a/tourism/media/${KEY}.jpg`;

let photo: Buffer;
test.beforeAll(async () => {
  photo = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#2b6cb0' } }).jpeg().toBuffer();
});

type Handler = (route: Route, url: URL, push: (item: unknown) => void) => Promise<unknown> | unknown;
// Item de imagem como a API real devolve (ver organizationOwnedMedia.ts):
// `src` canônico, para reenviar ao editar sem trocar a foto, e `previewSrc`
// — a rota de leitura autenticada da própria empresa — para a miniatura.
// Um mock que só devolvesse `previewSrc` (contrato antigo, já corrigido no
// servidor) deixaria passar uma regressão como essa sem que nenhum teste
// aqui percebesse.
const imageItem = (alt: string) => ({ src: PUBLIC_SRC, previewSrc: PREVIEW_SRC, alt });

function mockOrganizationApi(page: Page, { role, onCreateVisit, onCreateGallery, onUpdateVisit, onUpdateGallery }: {
  role: string; onCreateVisit?: Handler; onCreateGallery?: Handler;
  onUpdateVisit?: (route: Route, id: string, body: Record<string, unknown>) => unknown;
  onUpdateGallery?: (route: Route, id: string, body: Record<string, unknown>) => unknown;
}) {
  let authenticated = false;
  const visits: Array<Record<string, unknown>> = [];
  const entries: Array<Record<string, unknown>> = [];
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role } });
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (url.pathname === '/api/organizations/a/tourism/media' && request.method() === 'POST') {
      return route.fulfill({ status: 201, json: { id: 'm1', src: PUBLIC_SRC, previewSrc: PREVIEW_SRC, mimeType: 'image/jpeg', width: 320, height: 200, sizeBytes: photo.length, variants: [] } });
    }
    if (url.pathname === '/api/organizations/a/tourism/visits') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: visits, pagination: { page: 1, limit: 20, total: visits.length, totalPages: 1 } } });
      if (request.method() === 'POST' && onCreateVisit) return onCreateVisit(route, url, (item) => visits.push(item as Record<string, unknown>));
    }
    const visitMatch = url.pathname.match(/^\/api\/organizations\/a\/tourism\/visits\/(.+)$/);
    if (visitMatch) {
      const id = visitMatch[1];
      if (request.method() === 'GET') { const found = visits.find((v) => v.id === id); return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { error: 'Destino não encontrado' } }); }
      if (request.method() === 'PUT' && onUpdateVisit) return onUpdateVisit(route, id, request.postDataJSON() as Record<string, unknown>);
    }
    if (url.pathname === '/api/organizations/a/tourism/gallery') {
      if (request.method() === 'GET') return route.fulfill({ json: { data: entries, pagination: { page: 1, limit: 20, total: entries.length, totalPages: 1 } } });
      if (request.method() === 'POST' && onCreateGallery) return onCreateGallery(route, url, (item) => entries.push(item as Record<string, unknown>));
    }
    const galleryMatch = url.pathname.match(/^\/api\/organizations\/a\/tourism\/gallery\/(.+)$/);
    if (galleryMatch) {
      const id = galleryMatch[1];
      if (request.method() === 'GET') { const found = entries.find((e) => e.id === id); return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { error: 'Memória não encontrada' } }); }
      if (request.method() === 'PUT' && onUpdateGallery) return onUpdateGallery(route, id, request.postDataJSON() as Record<string, unknown>);
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function login(page: Page, path: 'visits' | 'gallery', linkName: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('link', { name: linkName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/empresa/a/${path}$`));
}

test('OWNER cadastra um destino visitado com foto própria', async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;
  mockOrganizationApi(page, {
    role: 'OWNER',
    onCreateVisit: (route, _url, push) => {
      createdBody = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: 'v1', title: createdBody!.title, description: createdBody!.description, date: createdBody!.date,
        city: createdBody!.city, region: createdBody!.region, lat: createdBody!.lat, lng: createdBody!.lng,
        needsReview: false, images: [imageItem('Vista da praia')], canEdit: true, updatedAt: '2030-01-01T00:00:00.000Z',
      };
      push(created);
      return route.fulfill({ status: 201, json: created });
    },
  });
  await login(page, 'visits', 'Destinos visitados');
  await expect(page.getByText('Nenhum destino encontrado')).toBeVisible();

  await page.getByRole('button', { name: 'Novo destino' }).first().click();
  await expect(page.getByRole('heading', { name: 'Novo destino' })).toBeVisible();
  await page.getByLabel('Título').fill('Praia do Coqueirinho');
  await page.getByLabel('Cidade').fill('Cabedelo');
  await page.getByLabel('Estado').fill('PB');

  await page.locator('#org-visit-photo-file').setInputFiles({ name: 'praia.jpg', mimeType: 'image/jpeg', buffer: photo });
  const alt = page.getByLabel('O que aparece nesta foto? (obrigatório)');
  await expect(alt).toBeFocused();
  await alt.fill('Vista da praia');
  await page.getByRole('button', { name: 'Usar esta foto' }).click();

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Novo destino' })).toHaveCount(0);
  await expect(page.getByText('Praia do Coqueirinho')).toBeVisible();

  expect(createdBody).not.toBeNull();
  // Nunca envia organizationId, source, needsReview ou storedIdentity: o
  // formulário não oferece esses campos.
  expect(createdBody).not.toHaveProperty('organizationId');
  expect(createdBody).not.toHaveProperty('source');
  expect(createdBody).not.toHaveProperty('storedIdentity');
  expect((createdBody as Record<string, unknown>).images).toEqual([{ src: PUBLIC_SRC, alt: 'Vista da praia' }]);
});

test('MEMBER só tem leitura na página de destinos: sem botão de criar', async ({ page }) => {
  mockOrganizationApi(page, { role: 'MEMBER' });
  await login(page, 'visits', 'Destinos visitados');
  await expect(page.getByText('Nenhum destino encontrado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo destino' })).toHaveCount(0);
});

test('OWNER cadastra uma memória na galeria exigindo foto', async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;
  mockOrganizationApi(page, {
    role: 'OWNER',
    onCreateGallery: (route, _url, push) => {
      createdBody = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: 'g1', title: createdBody!.title, date: createdBody!.date, dateDisplay: createdBody!.dateDisplay,
        description: createdBody!.description, isFeatured: false, images: [imageItem('Grupo na trilha')],
        canEdit: true, updatedAt: '2030-01-01T00:00:00.000Z',
      };
      push(created);
      return route.fulfill({ status: 201, json: created });
    },
  });
  await login(page, 'gallery', 'Galeria de memórias');
  await expect(page.getByText('Nenhuma memória encontrada')).toBeVisible();

  await page.getByRole('button', { name: 'Nova memória' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nova memória' })).toBeVisible();
  await page.getByLabel('Título').fill('Trilha do mirante');
  await page.locator('#org-gallery-date').fill('2030-02-10');
  await page.getByLabel('Descrição').fill('Grupo chegando ao mirante ao pôr do sol.');

  // Sem foto, o servidor nunca é chamado: a validação local exige ao menos uma.
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('ao menos uma foto');
  expect(createdBody).toBeNull();

  await page.locator('#org-gallery-photo-file').setInputFiles({ name: 'mirante.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByLabel('O que aparece nesta foto? (obrigatório)').fill('Grupo na trilha');
  await page.getByRole('button', { name: 'Usar esta foto' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Nova memória' })).toHaveCount(0);
  await expect(page.getByText('Trilha do mirante')).toBeVisible();
  expect(createdBody).not.toBeNull();
  expect((createdBody as Record<string, unknown>).images).toEqual([{ src: PUBLIC_SRC, alt: 'Grupo na trilha' }]);
});

test('editar destino mostra a miniatura pela prévia autenticada e salva sem reenviar previewSrc', async ({ page }) => {
  let updateBody: Record<string, unknown> | null = null;
  const existing = {
    id: 'v1', title: 'Praia do Coqueirinho', description: null, date: null, city: 'Cabedelo', region: 'PB', lat: null, lng: null,
    needsReview: false, images: [imageItem('Vista da praia')], canEdit: true, updatedAt: '2030-01-01T00:00:00.000Z',
  };
  mockOrganizationApi(page, {
    role: 'OWNER',
    onCreateVisit: (route, _url, push) => { push(existing); return route.fulfill({ status: 201, json: existing }); },
    onUpdateVisit: (route, _id, body) => { updateBody = body; return route.fulfill({ json: { ...existing, ...body, images: body.images, updatedAt: '2030-01-02T00:00:00.000Z' } }); },
  });
  await login(page, 'visits', 'Destinos visitados');
  // Garante o destino na lista chamando a mesma rota de criação usada pelo mock (sem passar por formulário).
  await page.evaluate(async () => { await fetch('/api/organizations/a/tourism/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });
  await page.reload();
  await expect(page.getByText('Praia do Coqueirinho')).toBeVisible();

  // Miniatura da lista usa a prévia autenticada da própria empresa, nunca o caminho público.
  await expect(page.locator('img[alt="Vista da praia"]')).toHaveAttribute('src', PREVIEW_SRC);

  await page.getByRole('button', { name: 'Editar Praia do Coqueirinho' }).click();
  await expect(page.getByRole('heading', { name: 'Editar destino' })).toBeVisible();
  // A foto já cadastrada também aparece pela prévia dentro do formulário de edição.
  await expect(page.locator('#org-visit-form img[alt="Vista da praia"]')).toHaveAttribute('src', PREVIEW_SRC);

  await page.locator('#org-visit-description').fill('Atualizado com nova descrição.');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar destino' })).toHaveCount(0);

  expect(updateBody).not.toBeNull();
  // A foto não mudou: o PUT reenvia o caminho canônico da imagem já existente, nunca a prévia.
  expect((updateBody as Record<string, unknown>).images).toEqual([{ src: PUBLIC_SRC, alt: 'Vista da praia' }]);
  expect((updateBody as Record<string, unknown>).description).toBe('Atualizado com nova descrição.');
});

test('editar memória da galeria mostra a prévia autenticada e preserva as fotos existentes ao salvar', async ({ page }) => {
  let updateBody: Record<string, unknown> | null = null;
  const existing = {
    id: 'g1', title: 'Trilha do mirante', date: '2030-02-10T00:00:00.000Z', dateDisplay: '10/02/2030', description: 'Grupo chegando ao mirante.',
    isFeatured: false, images: [imageItem('Grupo na trilha')], canEdit: true, updatedAt: '2030-01-01T00:00:00.000Z',
  };
  mockOrganizationApi(page, {
    role: 'OWNER',
    onCreateGallery: (route, _url, push) => { push(existing); return route.fulfill({ status: 201, json: existing }); },
    onUpdateGallery: (route, _id, body) => { updateBody = body; return route.fulfill({ json: { ...existing, ...body, images: body.images, updatedAt: '2030-01-02T00:00:00.000Z' } }); },
  });
  await login(page, 'gallery', 'Galeria de memórias');
  await page.evaluate(async () => { await fetch('/api/organizations/a/tourism/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });
  await page.reload();
  await expect(page.getByText('Trilha do mirante')).toBeVisible();
  await expect(page.locator('img[alt="Grupo na trilha"]')).toHaveAttribute('src', PREVIEW_SRC);

  await page.getByRole('button', { name: 'Editar Trilha do mirante' }).click();
  await expect(page.getByRole('heading', { name: 'Editar memória' })).toBeVisible();
  await expect(page.locator('#org-gallery-form img[alt="Grupo na trilha"]')).toHaveAttribute('src', PREVIEW_SRC);

  await page.getByLabel('Título').fill('Trilha do mirante — revisada');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar memória' })).toHaveCount(0);

  expect(updateBody).not.toBeNull();
  expect((updateBody as Record<string, unknown>).images).toEqual([{ src: PUBLIC_SRC, alt: 'Grupo na trilha' }]);
  expect((updateBody as Record<string, unknown>).title).toBe('Trilha do mirante — revisada');
});
