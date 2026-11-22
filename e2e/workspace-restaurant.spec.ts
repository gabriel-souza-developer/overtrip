import { expect, test } from '@playwright/test';

const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
const emptyMovement = { expected: 0, arrived: 0, overdue: 0 };

test('mesas e reservas isolam espaços, rejeitam conflito no turno e permitem cancelamento', async ({ page }) => {
  const orgs = [
    { id: 'org-a', name: 'Restaurante A', slug: 'a', niche: 'restaurante', role: 'owner' },
    { id: 'org-b', name: 'Restaurante B', slug: 'b', niche: 'restaurante', role: 'staff' },
  ];
  type Table = { id: string; name: string; capacity: number };
  type Booking = { id: string; tableId: string; guestName: string; partySize: number; date: string; shift: string; time: string; status: string; table: Table };
  const tables: Record<string, Table[]> = { 'org-a': [], 'org-b': [] };
  const bookings: Record<string, Booking[]> = { 'org-a': [], 'org-b': [] };
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: orgs } }));
  await page.route('**/api/organizations/current', route => {
    const id = route.request().headers()['x-organization-id'];
    const organization = orgs.find(org => org.id === id);
    expect(organization).toBeTruthy();
    return route.fulfill({ json: { organization } });
  });
  await page.route('**/api/restaurant/**', route => {
    const req = route.request();
    const organizationId = req.headers()['x-organization-id'];
    expect(['org-a', 'org-b']).toContain(organizationId);
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/movement')) return route.fulfill({ json: emptyMovement });
    if (path.endsWith('/tables') && req.method() === 'GET') return route.fulfill({ json: { tables: tables[organizationId], pagination } });
    if (path.endsWith('/tables') && req.method() === 'POST') {
      const table = { id: `${organizationId}-table`, name: req.postDataJSON().name, capacity: req.postDataJSON().capacity };
      tables[organizationId].push(table);
      return route.fulfill({ status: 201, json: table });
    }
    if (path.endsWith('/reservations') && req.method() === 'GET') return route.fulfill({ json: { reservations: bookings[organizationId], pagination } });
    if (path.endsWith('/reservations') && req.method() === 'POST') {
      const input = req.postDataJSON() as Pick<Booking, 'tableId' | 'guestName' | 'partySize' | 'date' | 'shift' | 'time'>;
      const table = tables[organizationId].find(item => item.id === input.tableId);
      expect(table).toBeTruthy();
      const conflict = bookings[organizationId].some(item => item.status !== 'CANCELLED' && item.tableId === input.tableId && item.date === input.date && item.shift === input.shift);
      if (conflict) return route.fulfill({ status: 409, json: { error: 'A mesa já está reservada nesse turno.' } });
      const booking = { ...input, id: `${organizationId}-booking-${bookings[organizationId].length}`, status: 'CONFIRMED', table: table! };
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
  await page.getByRole('button', { name: /Restaurante A/ }).click();
  await expect(page.getByRole('heading', { name: 'Restaurante A' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir operação' }).click();
  await page.getByRole('button', { name: 'Cadastrar mesa' }).click();
  await page.getByLabel('Nome da mesa').fill('Mesa 1');
  await page.getByLabel('Capacidade (lugares)').fill('4');
  await page.locator('#restaurant-table-form').getByRole('button', { name: 'Cadastrar mesa' }).click();
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await expect(page.locator('#booking-table').getByRole('option', { name: /Mesa 1/ })).toBeAttached();
  await page.locator('#booking-table').selectOption('org-a-table');
  await page.locator('#booking-guest').fill('Grupo da noite');
  await page.getByLabel('Tamanho do grupo').fill('3');
  await page.getByLabel('Data').fill('2026-12-10');
  await page.getByLabel('Turno').selectOption('JANTAR');
  await page.getByLabel('Horário').fill('20:00');
  await page.getByRole('button', { name: 'Registrar reserva' }).click();
  await expect(page.getByText('Grupo da noite')).toBeVisible();
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await page.locator('#booking-table').selectOption('org-a-table');
  await page.locator('#booking-guest').fill('Conflito');
  await page.getByLabel('Tamanho do grupo').fill('2');
  await page.getByLabel('Data').fill('2026-12-10');
  await page.getByLabel('Turno').selectOption('JANTAR');
  await page.getByLabel('Horário').fill('21:00');
  await page.getByRole('button', { name: 'Registrar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('já está reservada');
  await page.getByRole('button', { name: 'Trocar espaço' }).click();
  await page.getByRole('button', { name: /Restaurante B/ }).click();
  await expect(page.getByRole('heading', { name: 'Restaurante B' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir operação' }).click();
  await expect(page.getByText('Grupo da noite')).toHaveCount(0);
  await expect(page.locator('#booking-table').getByRole('option', { name: /Mesa 1/ })).toHaveCount(0);
  await expect(page.getByText('Nenhuma reserva registrada.')).toBeVisible();
  await page.getByRole('button', { name: 'Trocar espaço' }).click();
  await page.getByRole('button', { name: /Restaurante A/ }).click();
  await page.getByRole('button', { name: 'Abrir operação' }).click();
  const reservation = page.getByRole('article').filter({ hasText: 'Grupo da noite' });
  await reservation.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await reservation.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(reservation).toContainText('Cancelada');
});
