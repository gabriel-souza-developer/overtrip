import { expect, test } from '@playwright/test';

test('bloqueia noites, informa conflito e libera ao cancelar', async ({ page }) => {
  const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' };
  const unit = { id: 'unit-a', name: 'Suíte A' };
  const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
  let block: { id: string; unitId: string; start: string; end: string; reason: string | null; status: string; unit: typeof unit } | null = null;
  let conflict = false;
  let posts = 0;
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => route.fulfill({ json: { organization: org } }));
  await page.route('**/api/lodging/**', route => {
    const req = route.request();
    expect(req.headers()['x-organization-id']).toBe('org-a');
    const url = new URL(req.url());
    const path = url.pathname;
    if (path.endsWith('/units')) return route.fulfill({ json: { units: [unit], pagination } });
    if (path.endsWith('/reservations')) return route.fulfill({ json: { reservations: [], pagination: { ...pagination, total: 0, totalPages: 0 } } });
    if (path.endsWith('/movement')) return route.fulfill({ json: { arrivals: 0, departures: 0, overdueArrivals: 0, overdueDepartures: 0 } });
    if (path.endsWith('/occupancy')) {
      const blockedNights = block?.status === 'ACTIVE' ? ['2030-06-10', '2030-06-11'] : [];
      return route.fulfill({ json: { units: [{ ...unit, occupiedNights: [], blockedNights }], pagination, start: url.searchParams.get('start'), end: url.searchParams.get('end') } });
    }
    if (path.endsWith('/blocks') && req.method() === 'GET') return route.fulfill({ json: { blocks: block ? [block] : [], pagination: { ...pagination, total: block ? 1 : 0, totalPages: block ? 1 : 0 } } });
    if (path.endsWith('/blocks') && req.method() === 'POST') {
      posts++;
      if (conflict) return route.fulfill({ status: 409, json: { error: 'A unidade já está ocupada nesse período.' } });
      block = { ...req.postDataJSON(), id: 'block-a', status: 'ACTIVE', unit };
      return route.fulfill({ status: 201, json: block });
    }
    if (path.endsWith('/blocks/block-a/cancel')) { block!.status = 'CANCELLED'; return route.fulfill({ json: block }); }
    throw new Error(`Rota inesperada: ${req.method()} ${path}`);
  });

  await page.goto('/espaco');
  await page.getByRole('button', { name: 'Abrir operação' }).first().click();
  await expect(page.getByRole('heading', { name: 'Pousada A' })).toBeVisible();
  await page.getByLabel('A partir de', { exact: true }).fill('2030-06-10');
  await page.getByText('Novo bloqueio', { exact: true }).click();
  await page.getByLabel('Unidade do bloqueio').selectOption('unit-a');
  await page.getByLabel('Primeiro dia bloqueado').fill('2030-06-10');
  await page.getByLabel('Liberar a partir de').fill('2030-06-12');
  await page.getByLabel('Motivo', { exact: true }).fill('Manutenção');
  await page.getByRole('button', { name: 'Registrar bloqueio' }).click();
  const card = page.getByRole('article').filter({ hasText: 'Manutenção' });
  await expect(card).toContainText('Ativo');
  const row = page.getByRole('table', { name: /Disponibilidade de unidades/ }).getByRole('row').filter({ hasText: 'Suíte A' });
  await expect(row.getByRole('cell').nth(0)).toHaveText('Bloqueada');
  await expect(row.getByRole('cell').nth(2)).toHaveText('Sem reserva');

  conflict = true;
  await page.getByLabel('Unidade do bloqueio').selectOption('unit-a');
  await page.getByLabel('Primeiro dia bloqueado').fill('2030-06-11');
  await page.getByLabel('Liberar a partir de').fill('2030-06-13');
  await page.getByRole('button', { name: 'Registrar bloqueio' }).click();
  await expect(page.getByRole('alert')).toContainText('já está ocupada');
  expect(posts).toBe(2);
  await card.getByRole('button', { name: 'Cancelar bloqueio', exact: true }).click();
  await card.getByRole('button', { name: 'Confirmar cancelamento do bloqueio' }).click();
  await expect(card).toContainText('Cancelado');
  await expect(row.getByRole('cell').nth(0)).toHaveText('Sem reserva');
});

test('preserva o resultado ao falhar a atualização após registrar bloqueio', async ({ page }) => {
  const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'pousada', role: 'owner' };
  const unit = { id: 'unit-a', name: 'Suíte A' };
  const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
  let saved: Record<string, unknown> | null = null;
  let failRefresh = false;
  let attempts = 0;
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user', email: 'a@example.test', role: 'admin' } }));
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => route.fulfill({ json: { organization: org } }));
  await page.route('**/api/lodging/**', route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/units')) return route.fulfill({ json: { units: [unit], pagination } });
    if (path.endsWith('/reservations')) return route.fulfill({ json: { reservations: [], pagination: { ...pagination, total: 0, totalPages: 0 } } });
    if (path.endsWith('/movement')) return route.fulfill({ json: { arrivals: 0, departures: 0, overdueArrivals: 0, overdueDepartures: 0 } });
    if (path.endsWith('/occupancy')) return route.fulfill({ json: { units: [{ ...unit, occupiedNights: [], blockedNights: [] }], pagination } });
    if (path.endsWith('/blocks') && req.method() === 'POST') {
      attempts++; saved = { ...req.postDataJSON(), id: 'block-a', status: 'ACTIVE', unit }; failRefresh = true;
      return route.fulfill({ status: 201, json: saved });
    }
    if (path.endsWith('/blocks')) {
      if (failRefresh) { failRefresh = false; return route.fulfill({ status: 503, json: { error: 'Indisponível' } }); }
      return route.fulfill({ json: { blocks: saved ? [saved] : [], pagination } });
    }
    throw new Error(`Rota inesperada: ${req.method()} ${path}`);
  });
  await page.goto('/espaco');
  await page.getByRole('button', { name: 'Abrir operação' }).first().click();
  await page.getByText('Novo bloqueio', { exact: true }).click();
  await page.getByLabel('Unidade do bloqueio').selectOption('unit-a');
  await page.getByLabel('Primeiro dia bloqueado').fill('2030-06-10');
  await page.getByLabel('Liberar a partir de').fill('2030-06-12');
  await page.getByLabel('Motivo', { exact: true }).fill('Pintura');
  await page.getByRole('button', { name: 'Registrar bloqueio' }).click();
  await expect(page.getByRole('alert')).toContainText('Operação concluída');
  await expect(page.getByRole('button', { name: 'Registrar bloqueio' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tentar carregar bloqueios novamente' }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Pintura' })).toBeVisible();
  expect(attempts).toBe(1);
});
