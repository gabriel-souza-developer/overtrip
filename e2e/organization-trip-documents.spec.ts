import { expect, test, type Page } from '@playwright/test';

// PDFs do roteiro no painel de empresa: mesma UI do operador legado
// (TripDocuments.tsx, ver document-suggestions.spec.ts), reaproveitada via
// createOrganizationDocumentApi (frontend/src/api/organizationTripDocuments.ts)
// contra a rota isolada por empresa (organizationTripDocumentRoutes.ts).
// Isolamento real é da API (coberto em tests/organization-trip-documents-http.test.ts);
// este e2e cobre a UI: a seção só aparece ao editar uma viagem já existente,
// a sugestão nunca salva sozinha, o download usa a sessão da própria aba, e
// um MEMBER (sem OWNER/ADMIN) nunca vê o botão de editar — logo nunca chega
// a esta tela.

const owner = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const member = { id: 'u2', name: 'Colaborador', email: 'colaborador@example.test', role: 'admin', legacyAccess: false };

const tripDetail = {
  id: 'trip-1', title: 'Trilha do Mirante', category: 'Trilha', description: 'Caminhada guiada.', city: 'Areia', region: 'PB',
  startDateISO: '2030-08-01T06:00:00.000Z', endDateISO: null, status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z',
  headlineDisplay: null, filterCategory: null, departureTime: null, departureTolerance: null, returnTime: null,
  scheduleInfo: null, scheduleTBD: false, priceValue: null, priceDisplay: null, priceUnit: 'por pessoa', free: false,
  intensityClass: 'moderado', spotsLeft: null, trailDistance: null, supportPoint: null, supportPointInfo: null,
  meetingCity: null, meetingPoint: null, meetingTBD: true, meetingDetails: null, meetingMapsQuery: null,
  includes: [], includesHighlight: null, itinerary: [], routeNotes: [], importantInfo: [], media: [], departures: [],
};

// Resposta de sucesso da importação no mesmo formato de presentMediaAsset
// (ver organizationMediaRoutes.ts): o painel reaproveita a mesma tela de
// mídia do envio comum (ImageUploader.tsx) para a foto escolhida do PDF.
const importedMedia = {
  id: 'media-pdf-1', src: '/api/public/media/pdf-foto-1.jpg', previewSrc: '/api/organizations/a/tourism/media/pdf-foto-1.jpg',
  mimeType: 'image/jpeg', width: 100, height: 80, sizeBytes: 4096, variants: [],
};

function mockOrganizationApi(page: Page, role: 'OWNER' | 'MEMBER', user: typeof owner, images: {
  // undefined = resposta de sucesso default (2 candidatas); uma função
  // permite devolver um erro real (status + corpo) igual ao que o servidor
  // manda num 503/429/422/403, exatamente como organizationTripDocumentRoutes.ts.
  preview?: () => { status: number; json: unknown } | undefined;
  import?: () => { status: number; json: unknown } | undefined;
} = {}) {
  let authenticated = false;
  let downloadCookie: string | undefined;
  let suggestionsCalled = false;
  const writes: Record<string, unknown>[] = [];
  const previewCalls: number[] = [];
  const importCalls: number[] = [];
  const state = {
    downloadCookie: () => downloadCookie, suggestionsCalled: () => suggestionsCalled, writes,
    previewCalls: () => previewCalls.length, importCalls: () => importCalls,
  };
  const route = page.route((url) => url.pathname.startsWith('/api/'), async (r) => {
    const request = r.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return r.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return r.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return r.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role }] } });
    if (url.pathname === '/api/organizations/a') return r.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role } });
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return r.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (url.pathname === '/api/organizations/a/tourism/trips' && request.method() === 'GET') {
      return r.fulfill({ json: { data: [tripDetail], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1') {
      if (request.method() === 'PUT') { writes.push(request.postDataJSON() as Record<string, unknown>); return r.fulfill({ json: tripDetail }); }
      return r.fulfill({ json: tripDetail });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1/documents') {
      return r.fulfill({ json: [{ id: 'doc-1', originalFilename: 'roteiro.pdf', sizeBytes: 123, extractionStatus: 'READY', retentionUntil: '2030-01-01T00:00:00.000Z' }] });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1/documents/doc-1/suggestions') {
      suggestionsCalled = true;
      return r.fulfill({ json: {
        // spotsLeft é number na resposta real da IA (ver aiTripDraft.ts) —
        // mantém assim aqui de propósito: é exatamente o formato que expôs
        // o erro de tipo corrigido em applyAiDraft (OrganizationTrips.tsx).
        draft: { title: 'Novo título do PDF', city: 'Matureia', spotsLeft: 4 }, warnings: [],
        sources: {
          title: { documentId: 'doc-1', filename: 'roteiro.pdf', page: 1, excerpt: 'Novo título do PDF' },
          city: { documentId: 'doc-1', filename: 'roteiro.pdf', page: 2, excerpt: 'Matureia' },
          spotsLeft: { documentId: 'doc-1', filename: 'roteiro.pdf', page: 1, excerpt: 'restam 4 vagas' },
        },
      } });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1/documents/doc-1/images' && request.method() === 'POST') {
      previewCalls.push(1);
      const override = images.preview?.();
      if (override) return r.fulfill({ status: override.status, json: override.json });
      return r.fulfill({ json: { images: [
        { index: 0, page: 1, width: 100, height: 80, dataUrl: 'data:image/jpeg;base64,Zm9vMQ==' },
        { index: 1, page: 2, width: 200, height: 150, dataUrl: 'data:image/jpeg;base64,Zm9vMg==' },
      ] } });
    }
    const importMatch = url.pathname.match(/^\/api\/organizations\/a\/tourism\/trips\/trip-1\/documents\/doc-1\/images\/(\d+)\/import$/);
    if (importMatch && request.method() === 'POST') {
      importCalls.push(Number(importMatch[1]));
      const override = images.import?.();
      if (override) return r.fulfill({ status: override.status, json: override.json });
      return r.fulfill({ status: 201, json: importedMedia });
    }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1/documents/doc-1' && request.method() === 'GET') {
      downloadCookie = request.headers().cookie;
      return r.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 teste' });
    }
    return r.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  return { route, state };
}

async function login(page: Page, user: typeof owner) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
}

test('OWNER revisa a origem da sugestão do PDF e aplica só o campo escolhido, sem salvar sozinho', async ({ page }) => {
  // Sessão por cookie (mesmo padrão de document-suggestions.spec.ts): o
  // download precisa usar a mesma credencial da aba, nunca um token em
  // localStorage, mesmo pela rota isolada por empresa.
  await page.context().addCookies([{
    name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax',
  }]);
  const { state } = mockOrganizationApi(page, 'OWNER', owner);
  await login(page, owner);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toBeVisible();

  await expect(page.getByText('PDFs do roteiro')).toBeVisible();
  await page.getByRole('button', { name: 'Sugerir campos' }).click();
  expect(state.suggestionsCalled()).toBe(true);
  await expect(page.getByText('roteiro.pdf, página 2: “Matureia”')).toBeVisible();

  const city = page.getByRole('checkbox', { name: /Cidade.*Matureia/ });
  const title = page.getByRole('checkbox', { name: /Nome da viagem.*Novo título do PDF/ });
  // Vagas é a única sugestão numérica (ver aiTripDraft.ts): é a que expôs o
  // erro de tipo corrigido em applyAiDraft (number aplicado a um campo de
  // formulário que só aceita string) — por isso também precisa salvar
  // depois de aplicada, não só aparecer preenchida.
  const spots = page.getByRole('checkbox', { name: /Vagas.*4/ });
  await expect(city).not.toBeChecked();
  await expect(title).not.toBeChecked();
  await expect(spots).not.toBeChecked();
  await city.check();
  await spots.check();
  await page.getByRole('button', { name: 'Usar selecionados (2)' }).click();

  // Aplicar a sugestão só preenche o formulário; nunca salva por conta própria.
  await expect(page.locator('#org-trip-city')).toHaveValue('Matureia');
  await expect(page.locator('#org-trip-title')).toHaveValue('Trilha do Mirante');
  await expect(page.locator('#org-trip-spots')).toHaveValue('4');
  expect(state.writes.length).toBe(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar' }).click();
  await download;
  expect(state.downloadCookie()).toBe('overtrip_session=playwright-cookie-session');

  // Agora sim: salvar grava exatamente a mudança aplicada (nunca campos não
  // tocados nem metadados internos) — e não quebra com a sugestão numérica
  // de vagas (spotsLeft), que form.spotsLeft.trim() exigiria ser string.
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ city: 'Matureia', spotsLeft: 4 });
  expect(state.writes[0]).not.toHaveProperty('title');
  expect(state.writes[0]).not.toHaveProperty('organizationId');
});

test('MEMBER nunca vê o botão de editar — e portanto nunca chega aos PDFs do roteiro de outra pessoa', async ({ page }) => {
  mockOrganizationApi(page, 'MEMBER', member);
  await login(page, member);
  await expect(page.getByText('Trilha do Mirante')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Editar/ })).toHaveCount(0);
  await expect(page.getByText('PDFs do roteiro')).toHaveCount(0);
});

// A extração de fotos do PDF é desativada por padrão em todo ambiente (ver
// organizationTripDocumentRoutes.ts: precisa de duas variáveis de ambiente
// configuradas). O botão "Ver fotos do PDF" sempre aparece no painel — só o
// servidor decide se o recurso está ligado — então este é o estado mais
// comum na prática: a pessoa clica e recebe a recusa real do servidor, sem
// qualquer tela quebrada ou travada.
test('OWNER vê o aviso real do servidor quando a extração de fotos está desativada', async ({ page }) => {
  await page.context().addCookies([{ name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax' }]);
  mockOrganizationApi(page, 'OWNER', owner, {
    preview: () => ({ status: 503, json: { error: 'A extração de fotos do PDF está desativada neste ambiente.' } }),
  });
  await login(page, owner);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();
  await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
  await expect(page.getByRole('alert')).toHaveText('A extração de fotos do PDF está desativada neste ambiente.');
  // A tela continua funcional: nenhuma foto apareceu e outras ações do
  // documento (ex.: baixar) continuam disponíveis.
  await expect(page.getByRole('button', { name: 'Baixar' })).toBeEnabled();
});

test('OWNER revisa as fotos extraídas, escolhe uma, preenche o texto alternativo e importa sem salvar a viagem sozinho', async ({ page }) => {
  await page.context().addCookies([{ name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax' }]);
  const { state } = mockOrganizationApi(page, 'OWNER', owner);
  await login(page, owner);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();

  await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
  expect(state.previewCalls()).toBe(1);
  await expect(page.getByText('Fotos encontradas no PDF')).toBeVisible();
  const candidates = page.getByRole('button', { name: /Selecionar foto da página/ });
  await expect(candidates).toHaveCount(2);

  await page.getByRole('button', { name: 'Selecionar foto da página 2 (200×150 px)' }).click();
  const importButton = page.getByRole('button', { name: 'Importar esta foto' });
  // Sem texto alternativo, a importação não pode ser confirmada — mesma
  // exigência de acessibilidade do envio comum (ImageUploader.tsx).
  await expect(importButton).toBeDisabled();
  const altInput = page.getByLabel('O que aparece nesta foto? (obrigatório)');
  await altInput.fill('Grupo no mirante');
  await expect(importButton).toBeEnabled();
  await importButton.click();

  expect(state.importCalls()).toEqual([1]); // página 2 é o índice 1 na resposta mockada
  // Importar só preenche o formulário — nunca salva a viagem por conta própria.
  expect(state.writes.length).toBe(0);
  await expect(page.getByText('Fotos encontradas no PDF')).toHaveCount(0);
  // A foto importada entra na lista de fotos da viagem (primeira = capa),
  // já com o texto alternativo confirmado — mesma lista do envio comum.
  await expect(page.getByLabel('O que aparece na foto 1? (obrigatório)')).toHaveValue('Grupo no mirante');

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].media).toMatchObject([{ src: '/api/public/media/pdf-foto-1.jpg', alt: 'Grupo no mirante' }]);
});

test('OWNER importa pelo teclado (Enter no texto alternativo), sem usar o mouse', async ({ page }) => {
  await page.context().addCookies([{ name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax' }]);
  const { state } = mockOrganizationApi(page, 'OWNER', owner);
  await login(page, owner);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();
  await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
  await page.getByRole('button', { name: 'Selecionar foto da página 1 (100×80 px)' }).focus();
  await page.keyboard.press('Enter');
  const altInput = page.getByLabel('O que aparece nesta foto? (obrigatório)');
  await expect(altInput).toBeFocused();
  await altInput.press('Enter');
  expect(state.importCalls()).toEqual([]);
  await expect(page.getByText('Fotos encontradas no PDF')).toBeVisible();
  await altInput.fill('Vista da trilha');
  await altInput.press('Enter');
  expect(state.importCalls()).toEqual([0]);
  await expect(page.getByText('Fotos encontradas no PDF')).toHaveCount(0);
});

test('OWNER vê erro real quando o vínculo é revogado entre escolher a foto e confirmar a importação', async ({ page }) => {
  await page.context().addCookies([{ name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax' }]);
  const { state } = mockOrganizationApi(page, 'OWNER', owner, {
    import: () => ({ status: 403, json: { error: 'Sem permissão para esta operação nesta empresa' } }),
  });
  await login(page, owner);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();
  await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
  await page.getByRole('button', { name: 'Selecionar foto da página 1 (100×80 px)' }).click();
  await page.getByLabel('O que aparece nesta foto? (obrigatório)').fill('Grupo no mirante');
  await page.getByRole('button', { name: 'Importar esta foto' }).click();

  await expect(page.getByRole('alert')).toHaveText('Sem permissão para esta operação nesta empresa');
  // Nada foi adicionado ao formulário nem salvo.
  expect(state.writes.length).toBe(0);
  await expect(page.locator('li', { hasText: 'Capa' })).toHaveCount(0);
});

test('OWNER vê o limite real de extrações simultâneas sem travar a tela', async ({ page }) => {
  await page.context().addCookies([{ name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax' }]);
  mockOrganizationApi(page, 'OWNER', owner, {
    preview: () => ({ status: 429, json: { error: 'Muitas extrações de fotos em andamento. Tente novamente em alguns segundos.' } }),
  });
  await login(page, owner);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();
  await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
  await expect(page.getByRole('alert')).toHaveText('Muitas extrações de fotos em andamento. Tente novamente em alguns segundos.');
  await expect(page.getByText('Fotos encontradas no PDF')).toHaveCount(0);
  // A tela segue usável: o botão continua disponível para tentar de novo.
  await expect(page.getByRole('button', { name: 'Ver fotos do PDF' })).toBeEnabled();
});

test('a revisão de fotos do PDF funciona em tela de celular', async ({ page }) => {
  // Abaixo de lg o menu lateral começa fechado (ver PanelShell.tsx, mesmo
  // padrão de panel-menu.spec.ts): sem abrir, o link "Viagens" do login()
  // comum fica fora da área clicável.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.context().addCookies([{ name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax' }]);
  const { state } = mockOrganizationApi(page, 'OWNER', owner);
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(owner.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();
  await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
  const candidate = page.getByRole('button', { name: 'Selecionar foto da página 1 (100×80 px)' });
  await expect(candidate).toBeVisible();
  await candidate.click();
  const altInput = page.getByLabel('O que aparece nesta foto? (obrigatório)');
  await expect(altInput).toBeVisible();
  await altInput.fill('Trilha vista de cima');
  await page.getByRole('button', { name: 'Importar esta foto' }).click();
  expect(state.importCalls()).toEqual([0]);
});

test('não duplica a importação ao pressionar Enter repetidamente', async ({ page }) => {
  await page.context().addCookies([{ name: 'overtrip_session', value: 'playwright-cookie-session', url: 'http://127.0.0.1:4300', httpOnly: true, sameSite: 'Lax' }]);
  mockOrganizationApi(page, 'OWNER', owner);
  let requests = 0;
  await page.route('**/documents/doc-1/images/0/import', async route => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status: 201, json: importedMedia });
  });
  await login(page, owner);
  await page.getByRole('button', { name: 'Editar Trilha do Mirante' }).click();
  await page.getByRole('button', { name: 'Ver fotos do PDF' }).click();
  await page.getByRole('button', { name: 'Selecionar foto da página 1 (100×80 px)' }).click();
  const input = page.getByLabel('O que aparece nesta foto? (obrigatório)');
  await input.fill('Vista da trilha');
  await input.evaluate(element => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await expect(page.getByText('Fotos encontradas no PDF')).toHaveCount(0);
  expect(requests).toBe(1);
});
