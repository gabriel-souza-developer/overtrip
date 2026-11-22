import { expect, test, type Page } from '@playwright/test';

const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' };
const unit = { id: 'u1', name: 'Quarto 1' };
const reservation = (id: string, guestName: string) => ({ id, unitId: unit.id, guestName, checkIn: '2030-06-10', checkOut: '2030-06-11', status: 'CONFIRMED', unit });
const paginated = (page: number, total: number) => ({ page, limit: 20, total, totalPages: Math.ceil(total / 20) });
async function setup(page: Page, getTotal: () => number, onCancel: () => void) {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => route.fulfill({ json: { organization: org } }));
  await page.route('**/api/lodging/**', route => {
    const req = route.request();
    const url = new URL(req.url());
    const current = Number(url.searchParams.get('page') || '1');
    if (url.pathname.endsWith('/cancel') && req.method() === 'POST') { onCancel(); return route.fulfill({ json: {} }); }
    if (url.pathname.endsWith('/movement')) return route.fulfill({ json: { arrivals: 0, departures: 0, overdueArrivals: 0, overdueDepartures: 0 } });
    if (url.pathname.endsWith('/units')) return route.fulfill({ json: { units: [unit], pagination: paginated(current, 21) } });
    if (url.pathname.endsWith('/blocks')) return route.fulfill({ json: { blocks: [], pagination: paginated(1, 0) } });
    if (url.pathname.endsWith('/occupancy')) return route.fulfill({ json: { units: [{ ...unit, occupiedNights: [] }], pagination: paginated(1, 1) } });
    if (url.pathname.endsWith('/reservations')) {
      const total = getTotal();
      const rows = total === 0 ? [] : current === 1 ? [reservation('r1', 'Pessoa primeira')] : total > 20 ? [reservation('r2', 'Pessoa última')] : [];
      return route.fulfill({ json: { reservations: rows, pagination: paginated(current, total) } });
    }
    throw new Error(`Rota inesperada: ${req.method()} ${url.pathname}`);
  });
  await page.goto('/espaco');
  await page.getByRole('button', { name: 'Abrir operação' }).first().click();
}

test('cancelamento na última página retorna à página restante do filtro', async ({ page }) => {
  let total = 21;
  await setup(page, () => total, () => { total = 20; });
  await page.getByLabel('Situação da reserva').selectOption('CONFIRMED');
  await page.getByRole('button', { name: 'Próximas reservas' }).click();
  const last = page.getByRole('article').filter({ hasText: 'Pessoa última' });
  await expect(last).toBeVisible();
  await last.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await last.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Pessoa primeira' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próximas reservas' })).toHaveCount(0);
});

test('uma atualização normal retorna à primeira página mesmo quando o total cai a zero', async ({ page }) => {
  let total = 21;
  const pages: number[] = [];
  await setup(page, () => total, () => {});
  await page.getByRole('button', { name: 'Próximas reservas' }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Pessoa última' })).toBeVisible();
  total = 0;
  // Trocar a página de unidades dispara a consulta normal de reservas sem mudar seus filtros.
  await page.route('**/api/lodging/reservations?*', route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    pages.push(current);
    return route.fulfill({ json: { reservations: [], pagination: paginated(current, 0) } });
  });
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await page.getByRole('button', { name: 'Próximas unidades', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByText('Nenhuma reserva registrada.')).toBeVisible();
  expect(pages).toEqual([2, 1]);
  await page.waitForTimeout(400);
  expect(pages).toEqual([2, 1]);
});
