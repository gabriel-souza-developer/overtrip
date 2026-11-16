import { expect, test } from '@playwright/test';

test.skip(process.env.VITE_PLATFORM_MODE !== 'true', 'Exercitado com servidor em modo plataforma.');

test('modo plataforma usa login próprio, restringe rotas e permite sair', async ({ page }) => {
  let signedIn = false;
  const person = { id: 'user', name: 'Operadora', email: 'operadora@example.test', role: 'user' };
  const org = { id: 'org-a', name: 'Pousada A', slug: 'a', niche: 'restaurante', role: 'staff' };
  await page.route('**/api/auth/me', route => signedIn ? route.fulfill({ json: person }) : route.fulfill({ status: 401, json: { error: 'Não autenticado' } }));
  await page.route('**/api/auth/login', route => { signedIn = true; return route.fulfill({ json: { user: person } }); });
  await page.route('**/api/auth/logout', route => { signedIn = false; return route.fulfill({ status: 204 }); });
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [org] } }));
  await page.route('**/api/organizations/current', route => {
    expect(route.request().headers()['x-organization-id']).toBe('org-a');
    return route.fulfill({ json: { organization: org } });
  });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('E-mail').fill(person.email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/espaco$/);
  await expect(page.getByRole('heading', { name: 'Pousada A' })).toBeVisible();
  await page.goto('/trips');
  await expect(page).toHaveURL(/\/espaco$/);
  await expect(page.getByRole('link', { name: /Viagens|Reservas|Interessados/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
