import { expect, test } from '@playwright/test';

test('completa valores de uma saída pelo financeiro e atualiza o resumo', async ({ page }) => {
  const admin = { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'admin', legacyAccess: true };
  const record = { id: 'out-1', date: '2025-02-23T12:00:00.000Z', passengers: 30, courtesySeats: 1, pricePerPersonCents: 10000, transportCostCents: null, extraCostCents: null, supplier: 'Transportadora', notes: 'Nota preservada', updatedAt: '2025-02-01T00:00:00.000Z', onSite: false };
  let saved = false;
  let deleted = false;
  const totals = () => ({ outings: 1, completeOutings: saved ? 1 : 0, passengers: 30, courtesySeats: 1, revenueCents: saved ? 290000 : 0, expenseCents: saved ? 200000 : 0, resultCents: saved ? 90000 : 0, marginPct: saved ? 31 : null, averageTicketCents: saved ? 290000 : null, averageResultCents: saved ? 90000 : null });
  let submitted: unknown;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: admin });
    if (url.pathname === '/api/finance/summary') return route.fulfill({ json: { outings: { years: [2025], year: 2025, totals: totals(), incompleteOutings: saved ? 0 : 1, byYear: [{ ...totals(), year: 2025 }], byMonth: Array.from({ length: 12 }, (_, i) => ({ ...totals(), month: i + 1 })), byDestination: [], outings: [{ ...record, destinationId: 'dest-1', destinationName: 'Lagoa', revenueCents: 290000, expenseCents: saved ? 200000 : null, resultCents: saved ? 90000 : null, missing: saved ? [] : ['costs'] }] }, reservations: { activeReservations: 0, seats: 0, contractedCents: 0, receivedCents: 0, receivableCents: 0, openInstallmentsCents: 0, overdueCents: 0, overdueInstallments: 0, dueNext30DaysCents: 0, pendingInstallments: [] } } });
    if (url.pathname === '/api/destinations/dest-1' && route.request().method() === 'GET') return route.fulfill({ json: { outings: [record] } });
    if (url.pathname === '/api/destinations/dest-1/outings/out-1' && route.request().method() === 'PUT') { submitted = route.request().postDataJSON(); saved = true; return route.fulfill({ json: {} }); }
    if (url.pathname === '/api/destinations/dest-1/outings/out-1' && route.request().method() === 'DELETE') { deleted = true; return route.fulfill({ json: {} }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/finance');
  await expect(page.getByText('Falta: custos')).toBeVisible();
  await page.getByRole('button', { name: /Editar saída de Lagoa/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Transporte (R$)').fill('2000');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Falta: custos')).toHaveCount(0);
  await expect(page.getByLabel('Indicadores do período').getByText('R$ 900', { exact: true })).toBeVisible();
  expect(submitted).toEqual({ transportCostCents: 200000 });
  await page.getByRole('button', { name: /Excluir saída de Lagoa/ }).click();
  await expect(page.getByRole('dialog').getByText(/nova sincronização pode recriá-la/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(deleted).toBe(false);
  await page.getByRole('button', { name: /Excluir saída de Lagoa/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir saída' }).click();
  await expect.poll(() => deleted).toBe(true);
});
