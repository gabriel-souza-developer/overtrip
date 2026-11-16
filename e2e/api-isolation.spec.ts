import { expect, test } from '@playwright/test';

test('bloqueia acesso à API local quando não há interceptação', async ({ request }) => {
  const response = await request.post('/api/isolation-check', { data: { test: true } });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: 'API não simulada no teste.' });
});
