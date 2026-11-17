import { expect, test } from '@playwright/test';

// Registro administrativo de parcelas no painel de organizações: cobre
// adicionar, editar, marcar recebimento e o conflito de versão (409) mantendo
// o formulário aberto, tudo com a API simulada (mesma convenção de
// organization-reservation-create.spec.ts).

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const tripA = { id: 'trip-1', title: 'Trilha de Lucena', category: 'Trilha', city: 'Lucena', region: 'PB', startDateISO: '2030-06-01T09:00:00.000Z', endDateISO: null, status: 'OPEN' };
const baseReservation = {
  id: 'res-1', tripId: 'trip-1', customerName: 'Cliente Original', customerPhone: '83999990000', seats: 2,
  status: 'PENDING', totalCents: 100000, notes: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  trip: { id: 'trip-1', title: tripA.title, startDateISO: tripA.startDateISO },
  installments: [] as { id: string; amountCents: number; dueDate: string | null; paidAt: string | null; createdAt: string; updatedAt: string }[],
  leadId: null,
};

function mockOrganizationApi(page: import('@playwright/test').Page, { onInstallmentCreate, onInstallmentUpdate }: {
  onInstallmentCreate?: (body: unknown) => unknown; onInstallmentUpdate?: (id: string, body: unknown) => unknown;
}) {
  let authenticated = false;
  let reservation = { ...baseReservation };
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
      return route.fulfill({ json: { data: [reservation], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    }
    if (url.pathname === '/api/organizations/a/tourism/reservations/res-1/installments' && request.method() === 'POST') {
      const result = onInstallmentCreate?.(request.postDataJSON());
      if (result && typeof result === 'object' && '__error' in result) return route.fulfill((result as { __error: { status: number; json: unknown } }).__error);
      reservation = result as typeof reservation;
      return route.fulfill({ status: 201, json: reservation });
    }
    if (url.pathname.startsWith('/api/organizations/a/tourism/reservations/res-1/installments/') && request.method() === 'PUT') {
      const installmentId = url.pathname.split('/').pop()!;
      const result = onInstallmentUpdate?.(installmentId, request.postDataJSON());
      if (result && typeof result === 'object' && '__error' in result) return route.fulfill((result as { __error: { status: number; json: unknown } }).__error);
      reservation = result as typeof reservation;
      return route.fulfill({ json: reservation });
    }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/trips$/);
  await page.getByRole('link', { name: 'Reservas' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/reservations$/);
}

test('OWNER adiciona uma parcela e marca o recebimento manual', async ({ page }) => {
  let createBody: Record<string, unknown> | null = null;
  let updateBody: Record<string, unknown> | null = null;
  await mockOrganizationApi(page, {
    onInstallmentCreate: (body) => {
      createBody = body as Record<string, unknown>;
      const installment = { id: 'inst-1', amountCents: 40000, dueDate: null, paidAt: null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
      return { ...baseReservation, installments: [installment], updatedAt: '2026-01-02T00:00:00.000Z' };
    },
    onInstallmentUpdate: (_id, body) => {
      updateBody = body as Record<string, unknown>;
      const paid = (body as { paid?: boolean }).paid;
      const installment = { id: 'inst-1', amountCents: 40000, dueDate: null, paidAt: paid ? '2026-01-03T00:00:00.000Z' : null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' };
      return { ...baseReservation, installments: [installment], updatedAt: '2026-01-03T00:00:00.000Z' };
    },
  });
  await login(page);
  await page.getByRole('button', { name: /^Editar/ }).click();
  await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible();

  await page.locator('#org-installment-amount').fill('400,00');
  await page.getByRole('button', { name: 'Adicionar parcela' }).click();
  await expect(page.getByText('R$ 400,00', { exact: true })).toBeVisible();
  expect(createBody).not.toBeNull();
  expect((createBody as Record<string, unknown>).amountCents).toBe(40000);
  expect(createBody).toHaveProperty('expectedUpdatedAt', baseReservation.updatedAt);

  await page.getByRole('button', { name: 'Marcar recebida' }).click();
  await expect(page.getByText('Recebida', { exact: true })).toBeVisible();
  expect(updateBody).not.toBeNull();
  expect((updateBody as Record<string, unknown>).paid).toBe(true);
  expect(updateBody).toHaveProperty('expectedUpdatedAt', '2026-01-02T00:00:00.000Z');
});

test('conflito de versão ao adicionar parcela mantém o formulário aberto', async ({ page }) => {
  await mockOrganizationApi(page, {
    onInstallmentCreate: () => ({ __error: { status: 409, json: { error: 'Esta reserva foi alterada por outra pessoa. Recarregue os dados antes de salvar.' } } }),
  });
  await login(page);
  await page.getByRole('button', { name: /^Editar/ }).click();
  await page.locator('#org-installment-amount').fill('100,00');
  await page.getByRole('button', { name: 'Adicionar parcela' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Recarregue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible();
});

test('não permite salvar ou fechar a reserva durante gravação de parcela', async ({ page }) => {
  await mockOrganizationApi(page, {});
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/organizations/a/tourism/reservations/res-1/installments', async route => {
    started();
    await blocked;
    await route.fulfill({ status: 201, json: { ...baseReservation, updatedAt: '2026-01-02T00:00:00.000Z', installments: [{ id: 'inst-delay', amountCents: 10000, dueDate: null, paidAt: null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }] } });
  });
  try {
    await login(page);
    await page.getByRole('button', { name: /^Editar/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar reserva' });
    await page.locator('#org-installment-amount').fill('100,00');
    await page.getByRole('button', { name: 'Adicionar parcela' }).click();
    await requestStarted;
    await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog.getByText('R$ 100,00')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
  } finally { release(); }
});
