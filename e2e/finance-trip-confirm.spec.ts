import { expect, test } from '@playwright/test';

// Viagem de vários destinos criada a partir do site: aparece "A confirmar",
// com o nome dos destinos, e só é marcada realizada pela equipe.
test('confirma uma viagem de vários destinos que veio do site', async ({ page }) => {
  const admin = { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'admin', legacyAccess: true };
  const record = {
    id: 'out-1', date: '2026-08-15T12:00:00.000Z', status: null, effectiveStatus: 'UNCONFIRMED', statusConfirmed: false, parentOutingId: null,
    trip: { role: 'primary', primaryOutingId: 'out-1', primaryDestinationId: 'dest-1', destinations: [{ id: 'dest-1', name: 'Dique de Cabedelo' }, { id: 'dest-2', name: 'Fortaleza de Santa Catarina' }, { id: 'dest-3', name: 'Praia Formosa' }] },
    passengers: 20, courtesySeats: null, pricePerPersonCents: 6500, transportCostCents: 70000, extraCostCents: null, supplier: null, notes: 'Registrada a partir do mapa do site.', updatedAt: '2026-08-16T00:00:00.000Z', onSite: true,
  };
  const zero = { outings: 0, completeOutings: 0, passengers: 0, courtesySeats: 0, revenueCents: 0, expenseCents: 0, resultCents: 0, marginPct: null, averageTicketCents: null, averageResultCents: null };
  const row = { id: 'out-1', destinationId: 'dest-1', destinationName: 'Dique de Cabedelo', stops: [{ destinationId: 'dest-2', destinationName: 'Fortaleza de Santa Catarina' }, { destinationId: 'dest-3', destinationName: 'Praia Formosa' }],
    status: 'UNCONFIRMED', statusConfirmed: false, date: record.date, passengers: 20, courtesySeats: null, pricePerPersonCents: 6500, revenueCents: 130000, expenseCents: 70000, resultCents: 60000, missing: [], siteImported: true };
  let submitted: unknown;
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: admin });
    if (url.pathname === '/api/finance/summary') return route.fulfill({ json: {
      outings: { years: [2026], year: 2026, plannedOutings: 0, cancelledOutings: 0, unconfirmedOutings: 1, legacyRealizedOutings: 0, totals: zero, incompleteOutings: 0, byYear: [{ ...zero, year: 2026 }], byMonth: Array.from({ length: 12 }, (_, i) => ({ ...zero, month: i + 1 })), byDestination: [], outings: [], toConfirm: [row] },
      reservations: { activeReservations: 0, seats: 0, contractedCents: 0, receivedCents: 0, receivableCents: 0, openInstallmentsCents: 0, overdueCents: 0, overdueInstallments: 0, dueNext30DaysCents: 0, pendingInstallments: [] },
    } });
    if (url.pathname === '/api/destinations/dest-1' && route.request().method() === 'GET') return route.fulfill({ json: { outings: [record] } });
    if (url.pathname === '/api/destinations/dest-1/outings/out-1' && route.request().method() === 'PUT') { submitted = route.request().postDataJSON(); return route.fulfill({ json: {} }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/finance');
  const section = page.getByRole('region', { name: 'A confirmar' });
  await expect(section.getByText('Dique de Cabedelo + Fortaleza de Santa Catarina + Praia Formosa')).toBeVisible();
  await expect(page.getByText(/Fora dos totais: 1 a confirmar/)).toBeVisible();
  await section.getByRole('button', { name: /Confirmar saída de Dique de Cabedelo/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Situação').selectOption('REALIZED');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
  expect(submitted).toEqual({ status: 'REALIZED' });
});
