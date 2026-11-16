import { expect, test, type Page } from '@playwright/test';

const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
const emptyMovement = { arrivals: 0, departures: 0, overdueArrivals: 0, overdueDepartures: 0 };
async function mockBasicOccupancy(page: Page) {
  await page.route('**/api/lodging/occupancy?*', route => route.fulfill({ json: { units: [], pagination: { ...pagination, total: 0, totalPages: 0 } } }));
  await page.route('**/api/lodging/blocks?*', route => route.fulfill({ json: { blocks: [], pagination: { ...pagination, total: 0, totalPages: 0 } } }));
}


test('pede confirmação ao registrar chegada fora da data prevista', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2030-06-10T12:00:00.000Z'));
  const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' };
  const unit = { id: 'u1', name: 'Quarto' };
  let requests = 0;
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => route.fulfill({ json: { organization: org } }));
  await page.route('**/api/lodging/units?*', route => route.fulfill({ json: { units: [unit], pagination } }));
  await mockBasicOccupancy(page);
  await page.route('**/api/lodging/movement?*', route => route.fulfill({ json: emptyMovement }));
  await page.route('**/api/lodging/reservations?*', route => route.fulfill({ json: { pagination, reservations: [{ id: 'r1', unitId: 'u1', guestName: 'Ana', checkIn: '2030-06-12', checkOut: '2030-06-13', status: requests ? 'CHECKED_IN' : 'CONFIRMED', unit }] } }));
  await page.route('**/api/lodging/reservations/r1/check-in', route => { requests++; return route.fulfill({ json: {} }); });
  await page.goto('/espaco');
  const reservation = page.getByRole('article').filter({ hasText: 'Ana' });
  await reservation.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(reservation).toContainText('A data prevista é 12/06/2030');
  expect(requests).toBe(0);
  await reservation.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(reservation).toContainText('Hóspede presente');
  expect(requests).toBe(1);
});

test('mostra movimentos do dia e pendências anteriores sem presumir ausência', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2030-06-10T12:00:00.000Z'));
  const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' };
  const unit = { id: 'u1', name: 'Quarto' };
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => route.fulfill({ json: { organization: org } }));
  await page.route('**/api/lodging/units?*', route => route.fulfill({ json: { units: [unit], pagination } }));
  await mockBasicOccupancy(page);
  await page.route('**/api/lodging/movement?*', route => route.fulfill({ json: { arrivals: 1, departures: 1, overdueArrivals: 1, overdueDepartures: 0 } }));
  await page.route('**/api/lodging/reservations?*', route => route.fulfill({ json: { pagination, reservations: [
    { id: 'a', unitId: 'u1', guestName: 'Chegada hoje', checkIn: '2030-06-10', checkOut: '2030-06-11', status: 'CONFIRMED', unit },
    { id: 'b', unitId: 'u1', guestName: 'Saída hoje', checkIn: '2030-06-09', checkOut: '2030-06-10', status: 'CHECKED_IN', unit },
    { id: 'c', unitId: 'u1', guestName: 'Chegada anterior', checkIn: '2030-06-09', checkOut: '2030-06-10', status: 'CONFIRMED', unit },
  ] } }));
  await page.goto('/espaco');
  const movement = page.getByRole('region', { name: 'Movimento de hoje' });
  await expect(movement).toContainText('1 chegada prevista · 1 saída prevista');
  await expect(movement).toContainText('Pendências anteriores: 1 chegada · 0 saídas');
});

test('espaços isolam unidades e reservas, rejeitam conflito e permitem cancelamento', async ({ page }) => {
  const orgs = [
    { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' },
    { id: 'org-b', name: 'Pousada B', slug: 'b', niche: 'pousada', role: 'staff' },
  ];
  type Unit = { id: string; name: string };
  type Booking = { id: string; unitId: string; guestName: string; checkIn: string; checkOut: string; status: string; unit: Unit };
  const units: Record<string, Unit[]> = { 'org-a': [], 'org-b': [] };
  const bookings: Record<string, Booking[]> = { 'org-a': [], 'org-b': [] };
  const seen: string[] = [];
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin', name: 'Teste' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: orgs } }));
  await page.route('**/api/organizations/current', route => {
    const id = route.request().headers()['x-organization-id'];
    const organization = orgs.find(org => org.id === id);
    expect(organization).toBeTruthy();
    return route.fulfill({ json: { organization } });
  });
  await page.route('**/api/lodging/**', route => {
    const req = route.request();
    const organizationId = req.headers()['x-organization-id'];
    expect(['org-a', 'org-b']).toContain(organizationId);
    seen.push(organizationId);
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/blocks')) return route.fulfill({ json: { blocks: [], pagination: { ...pagination, total: 0, totalPages: 0 } } });
    if (path.endsWith('/movement')) return route.fulfill({ json: emptyMovement });
    if (path.endsWith('/occupancy')) return route.fulfill({ json: { units: units[organizationId].map(unit => ({ ...unit, occupiedNights: [] })), pagination } });
    if (path.endsWith('/units') && req.method() === 'GET') return route.fulfill({ json: { units: units[organizationId], pagination } });
    if (path.endsWith('/units') && req.method() === 'POST') {
      const unit = { id: `${organizationId}-unit`, name: req.postDataJSON().name };
      units[organizationId].push(unit);
      return route.fulfill({ status: 201, json: unit });
    }
    if (path.endsWith('/reservations') && req.method() === 'GET') return route.fulfill({ json: { reservations: bookings[organizationId], pagination } });
    if (path.endsWith('/reservations') && req.method() === 'POST') {
      const input = req.postDataJSON() as Pick<Booking, 'unitId' | 'guestName' | 'checkIn' | 'checkOut'>;
      const unit = units[organizationId].find(item => item.id === input.unitId);
      expect(unit).toBeTruthy();
      const overlap = bookings[organizationId].some(item => item.status !== 'CANCELLED' && item.unitId === input.unitId && input.checkIn < item.checkOut && item.checkIn < input.checkOut);
      if (overlap) return route.fulfill({ status: 409, json: { error: 'Unidade indisponível no período.' } });
      const booking = { ...input, id: `${organizationId}-booking`, status: 'CONFIRMED', unit: unit! };
      bookings[organizationId].push(booking);
      return route.fulfill({ status: 201, json: booking });
    }
    if (path.endsWith('/cancel') && req.method() === 'POST') {
      const id = path.split('/').at(-2);
      const booking = bookings[organizationId].find(item => item.id === id);
      expect(booking).toBeTruthy();
      booking!.status = 'CANCELLED';
      return route.fulfill({ json: booking });
    }
    throw new Error(`Requisição inesperada: ${req.method()} ${path}`);
  });

  await page.goto('/espaco');
  await page.getByRole('button', { name: /Pousada A/ }).click();
  await expect(page.getByRole('heading', { name: 'Pousada A' })).toBeVisible();
  await page.getByLabel('Nome da unidade').fill('Suíte A');
  await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
  await expect(page.locator('#stay-unit').getByRole('option', { name: 'Suíte A' })).toBeAttached();
  await page.locator('#stay-unit').selectOption('org-a-unit');
  await page.locator('#stay-guest').fill('Ana da pousada A');
  await page.getByLabel('Entrada').fill('2026-12-10');
  await page.getByLabel('Saída').fill('2026-12-12');
  await page.getByRole('button', { name: 'Registrar reserva' }).click();
  await expect(page.getByText('Ana da pousada A')).toBeVisible();
  await page.locator('#stay-unit').selectOption('org-a-unit');
  await page.locator('#stay-guest').fill('Conflito');
  await page.getByLabel('Entrada').fill('2026-12-11');
  await page.getByLabel('Saída').fill('2026-12-13');
  await page.getByRole('button', { name: 'Registrar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('Unidade indisponível');
  await page.getByRole('button', { name: 'Trocar espaço' }).click();
  await page.getByRole('button', { name: /Pousada B/ }).click();
  await expect(page.getByRole('heading', { name: 'Pousada B' })).toBeVisible();
  await expect(page.getByText('Ana da pousada A')).toHaveCount(0);
  await expect(page.locator('#stay-unit').getByRole('option', { name: 'Suíte A' })).toHaveCount(0);
  await expect(page.getByText('Nenhuma reserva registrada.')).toBeVisible();
  await page.getByRole('button', { name: 'Trocar espaço' }).click();
  await page.getByRole('button', { name: /Pousada A/ }).click();
  await expect(page.getByText('Ana da pousada A')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.getByRole('article').getByText('Cancelada', { exact: true })).toBeVisible();
  expect(seen).toContain('org-a');
  expect(seen).toContain('org-b');
});

test('informa que operação foi salva se atualização falha e permite recarregar', async ({ page }) => {
  const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' };
  let saved = false;
  let failRefresh = false;
  let attempts = 0;
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => route.fulfill({ json: { organization: org } }));
  await page.route('**/api/lodging/**', route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/blocks')) return route.fulfill({ json: { blocks: [], pagination: { ...pagination, total: 0, totalPages: 0 } } });
    if (path.endsWith('/movement')) return route.fulfill({ json: emptyMovement });
    if (path.endsWith('/occupancy')) return route.fulfill({ json: { units: [], pagination } });
    if (path.endsWith('/units') && req.method() === 'POST') {
      attempts++;
      saved = true;
      failRefresh = true;
      return route.fulfill({ status: 201, json: { id: 'unit-a', name: 'Suíte A' } });
    }
    if (path.endsWith('/units') && req.method() === 'GET') {
      if (failRefresh) { failRefresh = false; return route.fulfill({ status: 503, json: { error: 'Erro temporário' } }); }
      return route.fulfill({ json: { units: saved ? [{ id: 'unit-a', name: 'Suíte A' }] : [], pagination } });
    }
    if (path.endsWith('/reservations') && req.method() === 'GET') return route.fulfill({ json: { reservations: [], pagination } });
    throw new Error(`Requisição inesperada: ${req.method()} ${path}`);
  });
  await page.goto('/espaco');
  await page.getByLabel('Nome da unidade').fill('Suíte A');
  await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
  await expect(page.getByRole('alert')).toContainText('Operação concluída');
  await expect(page.getByRole('button', { name: 'Cadastrar unidade' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tentar carregar novamente' }).click();
  await expect(page.locator('#stay-unit').getByRole('option', { name: 'Suíte A' })).toBeAttached();
  expect(attempts).toBe(1);
});

test('revogação de acesso oculta dados e permite tentar novamente', async ({ page }) => {
  const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' };
  let revoked = false;
  const unit = { id: 'unit-a', name: 'Suíte A' };
  const booking = { id: 'booking-a', unitId: unit.id, guestName: 'Hóspede privado', checkIn: '2030-01-01', checkOut: '2030-01-02', status: 'CONFIRMED', unit };
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => route.fulfill({ json: { organization: org } }));
  await page.route('**/api/lodging/**', route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/blocks')) return route.fulfill({ json: { blocks: [], pagination: { ...pagination, total: 0, totalPages: 0 } } });
    if (path.endsWith('/units') && req.method() === 'POST') {
      revoked = true;
      return route.fulfill({ status: 403, json: { error: 'Acesso revogado.' } });
    }
    if (revoked) return route.fulfill({ status: 403, json: { error: 'Acesso revogado.' } });
    if (path.endsWith('/movement')) return route.fulfill({ json: emptyMovement });
    if (path.endsWith('/occupancy')) return route.fulfill({ json: { units: [], pagination } });
    if (path.endsWith('/units')) return route.fulfill({ json: { units: [unit], pagination } });
    if (path.endsWith('/reservations')) return route.fulfill({ json: { reservations: [booking], pagination } });
    throw new Error(`Requisição inesperada: ${req.method()} ${path}`);
  });
  await page.goto('/espaco');
  await expect(page.getByText('Hóspede privado')).toBeVisible();
  await page.getByLabel('Nome da unidade').fill('Outra unidade');
  await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
  await expect(page.getByRole('alert')).toContainText('Acesso revogado');
  await expect(page.getByText('Hóspede privado')).toHaveCount(0);
  await expect(page.locator('#stay-unit').getByRole('option', { name: 'Suíte A' })).toHaveCount(0);
  revoked = false;
  await page.getByRole('button', { name: 'Tentar carregar novamente' }).click();
  await expect(page.getByText('Hóspede privado')).toBeVisible();
});
