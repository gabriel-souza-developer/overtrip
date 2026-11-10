import { expect, test } from '@playwright/test';

const admin = { id: 'faq-admin', email: 'faq@example.test', name: 'Admin', role: 'admin' };
const initial = { version: 0, updatedAt: null, entries: [
  { question: 'Posso embarcar sozinho(a)?', answer: 'Pode sim, venha com a gente.' },
  { question: 'Como confirmo minha vaga?', answer: 'Com uma reserva.' },
] };

test('edita o FAQ, mostra a prévia e salva para atualizar o site', async ({ page }) => {
  await page.addInitScript((user) => {
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, admin);

  let published: { expectedVersion: number; entries: Array<{ question: string; answer: string }> } | null = null;
  await page.route((url) => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: admin });
    if (url.pathname === '/api/settings/whatsapp') return route.fulfill({ json: { defaultWhatsapp: null } });
    if (url.pathname === '/api/settings/trip-presentation') return route.fulfill({ json: { buttonLabel: 'Quero viajar', buttonClass: 'button-dark', priceUnit: 'por pessoa' } });
    if (url.pathname === '/api/settings/public-faq' && route.request().method() === 'GET') return route.fulfill({ json: initial });
    if (url.pathname === '/api/settings/public-faq' && route.request().method() === 'PUT') {
      published = route.request().postDataJSON();
      return route.fulfill({ json: { version: 1, updatedAt: new Date().toISOString(), entries: published.entries } });
    }
    if (url.pathname === '/api/assistant-knowledge') return route.fulfill({ json: null });
    if (url.pathname === '/api/assistant-knowledge/versions') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto('/settings');
  const question = page.getByLabel('Pergunta', { exact: true }).first();
  await expect(question).toHaveValue('Posso embarcar sozinho(a)?');
  await question.fill('Posso viajar sozinho?');
  await expect(page.getByRole('complementary', { name: 'Prévia do FAQ no site' })).toContainText('Posso viajar sozinho?');
  await page.getByRole('button', { name: 'Salvar e atualizar o site' }).click();
  await expect(page.getByRole('status')).toContainText('FAQ salvo e atualizado no site');
  expect(published?.expectedVersion).toBe(0);
  expect(published?.entries[0]).toEqual({ question: 'Posso viajar sozinho?', answer: 'Pode sim, venha com a gente.' });
});
