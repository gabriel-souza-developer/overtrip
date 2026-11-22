import { expect, test, type Page, type Route } from '@playwright/test';

// Histórico de auditoria de uma reserva (ReservationAuditLog) no painel de
// organizações: ação e horário, nunca o id técnico do autor como se fosse
// um nome, paginado, acessível e com estados de carregamento/vazio/erro.
// Mesma convenção de mocks de organization-reservation-installments.spec.ts.
// Isolamento por papel (MEMBER não vê a página de Reservas, logo nunca vê o
// histórico) já é coberto por organization-reservation-create.spec.ts; este
// arquivo cobre só o recurso novo.

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const tripA = { id: 'trip-1', title: 'Trilha de Lucena', category: 'Trilha', city: 'Lucena', region: 'PB', startDateISO: '2030-06-01T09:00:00.000Z', endDateISO: null, status: 'OPEN' };
const baseReservation = {
  id: 'res-1', tripId: 'trip-1', customerName: 'Cliente Original', customerPhone: '83999990000', seats: 2,
  status: 'PENDING', totalCents: 100000, notes: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  trip: { id: 'trip-1', title: tripA.title, startDateISO: tripA.startDateISO },
  installments: [],
  leadId: null,
};
// Segunda reserva, usada só nos testes de corrida (A→B): outro id, outro
// nome de cliente, para provar que uma resposta tardia de uma nunca vaza
// para o modal da outra.
const reservationB = {
  id: 'res-2', tripId: 'trip-1', customerName: 'Cliente Dois', customerPhone: '83999991111', seats: 1,
  status: 'PENDING', totalCents: 50000, notes: null, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
  trip: { id: 'trip-1', title: tripA.title, startDateISO: tripA.startDateISO },
  installments: [],
  leadId: null,
};
// Ator deliberadamente parecido com um id técnico de verdade (cuid), para
// provar que a UI nunca o renderiza como se fosse um nome de pessoa.
const RAW_ACTOR_ID = 'clz9f8h7a0001xyzabcde1234';
const entry = (id: string, action: string, createdAt: string, entityId = 'res-1') => ({ id, action, entityType: 'Reservation', entityId, actorUserId: RAW_ACTOR_ID, createdAt });

type AuditResponder = (page: number) => { status?: number; json: unknown };

function mockOrganizationApi(page: import('@playwright/test').Page, onAudit: AuditResponder) {
  let authenticated = false;
  return page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role: 'OWNER' }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (url.pathname === '/api/organizations/a/tourism/trips') return route.fulfill({ json: { data: [tripA], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
    if (url.pathname === '/api/organizations/a/tourism/leads') return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } } });
    if (url.pathname === '/api/organizations/a/tourism/reservations' && request.method() === 'GET') {
      return route.fulfill({ json: { data: [baseReservation], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    }
    if (url.pathname === '/api/organizations/a/tourism/reservations/res-1/audit' && request.method() === 'GET') {
      const requestedPage = Number(url.searchParams.get('page') ?? '1');
      const result = onAudit(requestedPage);
      return route.fulfill({ status: result.status ?? 200, json: result.json });
    }
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

// Para os testes de corrida: lista as DUAS reservas e segura cada requisição
// de /audit sem responder, até o teste decidir a ordem e o conteúdo da
// resposta — é assim que se reproduz de forma determinística "a resposta
// tardia chega depois da mais nova" sem depender de timing real de rede.
interface PendingAuditRequest { reservationId: string; page: number; route: Route }
function mockOrganizationApiControlled(page: Page): PendingAuditRequest[] {
  let authenticated = false;
  const pendingAudit: PendingAuditRequest[] = [];
  void page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role: 'OWNER' }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (url.pathname === '/api/organizations/a/tourism/trips') return route.fulfill({ json: { data: [tripA], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
    if (url.pathname === '/api/organizations/a/tourism/leads') return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } } });
    if (url.pathname === '/api/organizations/a/tourism/reservations' && request.method() === 'GET') {
      return route.fulfill({ json: { data: [baseReservation, reservationB], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } } });
    }
    const auditMatch = url.pathname.match(/^\/api\/organizations\/a\/tourism\/reservations\/([^/]+)\/audit$/);
    if (auditMatch && request.method() === 'GET') {
      pendingAudit.push({ reservationId: auditMatch[1], page: Number(url.searchParams.get('page') ?? '1'), route });
      return; // fica pendente: quem decide quando (e com quê) responder é o teste
    }
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  return pendingAudit;
}
async function takePendingAuditRequest(pending: PendingAuditRequest[], match: { reservationId: string; page: number }, timeoutMs = 2000): Promise<PendingAuditRequest> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const index = pending.findIndex((p) => p.reservationId === match.reservationId && p.page === match.page);
    if (index !== -1) return pending.splice(index, 1)[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Requisição de auditoria esperada não chegou: ${JSON.stringify(match)}`);
}

async function login(page: import('@playwright/test').Page, { mobile = false }: { mobile?: boolean } = {}) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  // No celular o menu lateral fica escondido atrás do botão "Abrir menu"
  // (mesma convenção de organization-shell.spec.ts).
  if (mobile) {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('navigation', { name: 'Navegação da empresa' }).getByRole('link', { name: 'Reservas', exact: true }).click();
  } else {
    await page.getByRole('link', { name: 'Reservas', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/empresa\/a\/reservations$/);
}

test('OWNER abre o histórico, navega para a próxima página e nunca vê o id técnico do autor (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockOrganizationApi(page, (requestedPage) => {
    if (requestedPage === 1) {
      return { json: { data: [entry('audit-2', 'INSTALLMENT_CREATED', '2026-01-02T10:00:00.000Z'), entry('audit-1', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z')], pagination: { page: 1, limit: 2, total: 3, totalPages: 2 } } };
    }
    return { json: { data: [entry('audit-0', 'RESERVATION_UPDATED', '2025-12-31T08:00:00.000Z')], pagination: { page: 2, limit: 2, total: 3, totalPages: 2 } } };
  });
  await login(page);

  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Parcela adicionada')).toBeVisible();
  await expect(dialog.getByText('Reserva criada')).toBeVisible();
  await expect(dialog.getByText('02/01/2026')).toBeVisible();

  // Nunca o id técnico do autor em lugar nenhum da tela (nem como "nome").
  await expect(page.getByText(RAW_ACTOR_ID)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Próxima página' }).click();
  await expect(dialog.getByText('Reserva atualizada')).toBeVisible();
  await expect(dialog.getByText('Parcela adicionada')).toHaveCount(0);

  // Esc fecha (Modal é um Radix Dialog acessível): evita a ambiguidade entre
  // o "X" do cabeçalho e o botão "Fechar" do rodapé, os dois com o mesmo
  // nome acessível.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('mobile: botão alcançável, modal abre e pagina sem perder acessibilidade', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockOrganizationApi(page, (requestedPage) => ({
    json: {
      data: [entry('audit-1', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z')],
      pagination: { page: requestedPage, limit: 10, total: 1, totalPages: 1 },
    },
  }));
  await login(page, { mobile: true });

  const historyButton = page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' });
  await expect(historyButton).toBeVisible();
  await historyButton.click();
  const dialog = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Reserva criada')).toBeVisible();
  // Uma única página: a navegação de páginas não aparece (Pagination some com totalPages <= 1).
  await expect(dialog.getByRole('navigation', { name: 'Páginas' })).toHaveCount(0);
});

test('nenhuma atividade registrada: mostra o estado vazio, não um erro', async ({ page }) => {
  await mockOrganizationApi(page, () => ({ json: { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } }));
  await login(page);
  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialog.getByText('Nenhuma atividade registrada')).toBeVisible();
});

test('indisponibilidade: erro ao carregar mostra estado de erro com nova tentativa, e ela se recupera', async ({ page }) => {
  let shouldFail = true;
  await mockOrganizationApi(page, () => {
    if (shouldFail) { shouldFail = false; return { status: 500, json: { error: 'Erro interno' } }; }
    return { json: { data: [entry('audit-1', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z')], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } };
  });
  await login(page);
  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(dialog.getByText('Reserva criada')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('página 2 falha e "Tentar de novo" repete a página 2, nunca a página 1', async ({ page }) => {
  // Bug corrigido: historyPagination só avança com resposta bem-sucedida,
  // então depois de uma página 1 ok seguida de uma página 2 que falha, ele
  // continua marcando "página 1" — se o retry usasse esse valor, repetiria
  // a página 1 (que sempre funciona aqui) em vez da 2 (que falhou).
  let page2Attempts = 0;
  await mockOrganizationApi(page, (requestedPage) => {
    if (requestedPage === 1) {
      return { json: { data: [entry('audit-1', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z'), entry('audit-2', 'INSTALLMENT_CREATED', '2026-01-02T10:00:00.000Z')], pagination: { page: 1, limit: 2, total: 3, totalPages: 2 } } };
    }
    page2Attempts += 1;
    if (page2Attempts === 1) return { status: 500, json: { error: 'Erro interno' } };
    return { json: { data: [entry('audit-0', 'RESERVATION_UPDATED', '2025-12-31T08:00:00.000Z')], pagination: { page: 2, limit: 2, total: 3, totalPages: 2 } } };
  });
  await login(page);
  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialog.getByText('Reserva criada')).toBeVisible();

  await dialog.getByRole('button', { name: 'Próxima página' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await dialog.getByRole('button', { name: 'Tentar de novo' }).click();
  // Repetiu a página 2 (que agora responde com sucesso), nunca a página 1.
  await expect(dialog.getByText('Reserva atualizada')).toBeVisible();
  await expect(dialog.getByText('Reserva criada')).toHaveCount(0);
  await expect(dialog.getByText('Parcela adicionada')).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(page2Attempts).toBe(2);
});

test('indisponibilidade no meio da paginação: acesso revogado na página 2 mostra erro, sem misturar com a página 1', async ({ page }) => {
  await mockOrganizationApi(page, (requestedPage) => {
    if (requestedPage === 2) return { status: 403, json: { error: 'Acesso revogado' } };
    return { json: { data: [entry('audit-1', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z'), entry('audit-2', 'RESERVATION_UPDATED', '2026-01-02T09:00:00.000Z')], pagination: { page: 1, limit: 2, total: 3, totalPages: 2 } } };
  });
  await login(page);
  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialog.getByText('Reserva criada')).toBeVisible();
  await dialog.getByRole('button', { name: 'Próxima página' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  // Nunca mistura o que já tinha carregado da página 1 com o erro da página 2.
  await expect(dialog.getByText('Reserva criada')).toHaveCount(0);
  await expect(dialog.getByText('Reserva atualizada')).toHaveCount(0);
});

test('resposta tardia da reserva A nunca aparece no histórico de B, mesmo chegando depois (A→B)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pending = mockOrganizationApiControlled(page);
  await login(page);

  // Abre o histórico de A: dispara (res-1, página 1) e fica esperando a resposta.
  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' }).click();
  const dialogA = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialogA).toBeVisible();
  const reqA = await takePendingAuditRequest(pending, { reservationId: 'res-1', page: 1 });

  // Fecha A (sem a resposta nunca ter chegado) e abre B: dispara (res-2, página 1).
  await page.keyboard.press('Escape');
  await expect(dialogA).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Dois' }).click();
  const dialogB = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialogB).toBeVisible();
  const reqB = await takePendingAuditRequest(pending, { reservationId: 'res-2', page: 1 });

  // B responde primeiro...
  await reqB.route.fulfill({ json: { data: [entry('audit-b', 'INSTALLMENT_CREATED', '2026-02-01T09:00:00.000Z', 'res-2')], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } });
  await expect(dialogB.getByText('Parcela adicionada')).toBeVisible();

  // ...e A, mais devagar, responde DEPOIS. O fetch de A foi abortado ao
  // fechar o modal (fulfill pode falhar nesse caso); de um jeito ou de
  // outro, o conteúdo de A nunca pode chegar à tela de B.
  await reqA.route.fulfill({ json: { data: [entry('audit-a', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z')], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } }).catch(() => {});
  await page.waitForTimeout(300);
  await expect(dialogB.getByText('Reserva criada')).toHaveCount(0);
  // B continua intacto.
  await expect(dialogB.getByText('Parcela adicionada')).toBeVisible();
});

test('página atrasada e fora de ordem nunca sobrescreve a página que o usuário já voltou a pedir', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pending = mockOrganizationApiControlled(page);
  await login(page);

  await page.getByRole('button', { name: 'Ver histórico da reserva de Cliente Original' }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico da reserva' });
  await expect(dialog).toBeVisible();
  const page1First = await takePendingAuditRequest(pending, { reservationId: 'res-1', page: 1 });
  await page1First.route.fulfill({ json: { data: [entry('audit-1', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z'), entry('audit-2', 'INSTALLMENT_CREATED', '2026-01-02T10:00:00.000Z')], pagination: { page: 1, limit: 2, total: 3, totalPages: 2 } } });
  await expect(dialog.getByText('Reserva criada')).toBeVisible();

  // Clica no número da página (não "próxima", que dependeria do estado já
  // confirmado): dispara (res-1, página 2) e fica pendente.
  await dialog.getByRole('button', { name: 'Página 2' }).click();
  const page2 = await takePendingAuditRequest(pending, { reservationId: 'res-1', page: 2 });

  // Antes da página 2 responder, o usuário já clica de volta na página 1:
  // dispara uma SEGUNDA requisição (res-1, página 1).
  await dialog.getByRole('button', { name: 'Página 1' }).click();
  const page1Second = await takePendingAuditRequest(pending, { reservationId: 'res-1', page: 1 });

  // A resposta da página 2 chega DEPOIS (fora de ordem) — não pode aparecer,
  // porque o usuário já pediu a página 1 de novo.
  await page2.route.fulfill({ json: { data: [entry('audit-0', 'RESERVATION_UPDATED', '2025-12-31T08:00:00.000Z')], pagination: { page: 2, limit: 2, total: 3, totalPages: 2 } } }).catch(() => {});
  await page.waitForTimeout(300);
  await expect(dialog.getByText('Reserva atualizada')).toHaveCount(0);

  // A segunda resposta da página 1, essa sim a mais nova, é a que deve aparecer.
  await page1Second.route.fulfill({ json: { data: [entry('audit-1', 'RESERVATION_CREATED', '2026-01-01T09:00:00.000Z'), entry('audit-2', 'INSTALLMENT_CREATED', '2026-01-02T10:00:00.000Z')], pagination: { page: 1, limit: 2, total: 3, totalPages: 2 } } });
  await expect(dialog.getByText('Reserva criada')).toBeVisible();
  await expect(dialog.getByText('Parcela adicionada')).toBeVisible();
});
