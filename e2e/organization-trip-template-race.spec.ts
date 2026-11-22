import { expect, test, type Page } from '@playwright/test';

const user = { id: 'u1', name: 'Agente', email: 'agente@example.test', role: 'admin', legacyAccess: false };
const trips = [
  { id: 'trip-1', title: 'Primeira viagem', category: 'Passeio', description: 'Primeira', city: 'Recife', region: 'PE', startDateISO: '2030-01-01T12:00:00.000Z', status: 'DRAFT', updatedAt: '2030-01-01T00:00:00.000Z' },
  { id: 'trip-2', title: 'Segunda viagem', category: 'Passeio', description: 'Segunda', city: 'Olinda', region: 'PE', startDateISO: '2030-01-02T12:00:00.000Z', status: 'DRAFT', updatedAt: '2030-01-02T00:00:00.000Z' },
];
const detail = (id: string) => ({
  ...trips.find(trip => trip.id === id)!, endDateISO: null, headlineDisplay: null, filterCategory: null,
  departureTime: null, departureTolerance: null, returnTime: null, scheduleInfo: null, scheduleTBD: false,
  priceValue: null, priceDisplay: null, priceUnit: 'por pessoa', free: false, intensityClass: 'leve', spotsLeft: null,
  trailDistance: null, supportPoint: null, supportPointInfo: null, meetingCity: null, meetingPoint: null, meetingTBD: true,
  meetingDetails: null, meetingMapsQuery: null, includes: [], includesHighlight: null, itinerary: [], routeNotes: [],
  importantInfo: [], media: [], departures: [],
});

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function setup(page: Page, delayFirst: Promise<void>, onFirst: () => void, delaySecond?: Promise<void>, onSecond?: () => void) {
  let authenticated = false;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill(authenticated ? { json: user } : { status: 401, json: { error: 'Não autenticado' } });
    if (url.pathname === '/api/auth/login') { authenticated = true; return route.fulfill({ json: { user } }); }
    if (url.pathname === '/api/organizations') return route.fulfill({ json: { organizations: [{ id: 'a', name: 'Agência A', slug: 'a', role: 'OWNER' }] } });
    if (url.pathname === '/api/organizations/a') return route.fulfill({ json: { organization: { id: 'a', name: 'Agência A', slug: 'a', status: 'ACTIVE' }, role: 'OWNER' } });
    if (url.pathname === '/api/organizations/a/tourism/dashboard') return route.fulfill({ json: { trips: { total: 0, upcoming: 0, open: 0, drafts: 0 }, leads: 0, reservations: 0 } });
    if (url.pathname === '/api/organizations/a/tourism/trips') return route.fulfill({ json: { data: trips, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } } });
    if (/\/trips\/trip-[12]\/documents$/.test(url.pathname)) return route.fulfill({ json: [] });
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-1') { onFirst(); await delayFirst; return route.fulfill({ json: detail('trip-1') }); }
    if (url.pathname === '/api/organizations/a/tourism/trips/trip-2') { onSecond?.(); if (delaySecond) await delaySecond; return route.fulfill({ json: detail('trip-2') }); }
    return route.fulfill({ json: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
  });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/empresa\/a\/dashboard$/);
  await page.getByRole('link', { name: 'Viagens', exact: true }).click();
  await expect(page.getByText('Primeira viagem', { exact: true })).toBeVisible();
}

for (const action of ['modelo', 'edição'] as const) {
  test(`resposta atrasada de ${action} não substitui uma nova viagem já preenchida`, async ({ page }) => {
    const first = deferred(); const requested = deferred();
    await setup(page, first.promise, requested.release);
    await page.getByRole('button', { name: action === 'modelo' ? 'Usar Primeira viagem como modelo' : 'Editar Primeira viagem' }).click();
    await requested.promise;
    await page.getByRole('button', { name: 'Nova viagem' }).click();
    await page.locator('#org-trip-title').fill('Conteúdo que não pode se perder');
    const firstResponse = page.waitForResponse(response => response.url().endsWith('/trips/trip-1'));
    first.release();
    await firstResponse;
    await page.waitForTimeout(150);
    await expect(page.locator('#org-trip-title')).toHaveValue('Conteúdo que não pode se perder');
    await expect(page.getByRole('heading', { name: 'Nova viagem', exact: true })).toBeVisible();
  });
}

test('resposta antiga não substitui a última viagem escolhida para edição', async ({ page }) => {
  const first = deferred(); const firstRequested = deferred();
  const second = deferred(); const secondRequested = deferred();
  await setup(page, first.promise, firstRequested.release, second.promise, secondRequested.release);
  await page.getByRole('button', { name: 'Editar Primeira viagem' }).click();
  await firstRequested.promise;
  await page.getByRole('button', { name: 'Editar Segunda viagem' }).click();
  await secondRequested.promise;
  second.release();
  await expect(page.locator('#org-trip-title')).toHaveValue('Segunda viagem');
  await page.locator('#org-trip-title').fill('Segunda editada');
  const firstResponse = page.waitForResponse(response => response.url().endsWith('/trips/trip-1'));
  first.release();
  await firstResponse;
  await page.waitForTimeout(150);
  await expect(page.locator('#org-trip-title')).toHaveValue('Segunda editada');
});
