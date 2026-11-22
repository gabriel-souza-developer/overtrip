import { expect, test } from '@playwright/test';

test('pousada registra estadias persistentes e recusa noites sobrepostas', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('e2e@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-e2e-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(process.env.OVERTRIP_E2E_PLATFORM_ONLY === '1' ? /\/espaco/ : /\/dashboard/);
  await page.goto('/espaco');
  await expect(page.getByText('Pousada fictícia E2E').first()).toBeVisible();
  await page.getByRole('button', { name: 'Abrir operação' }).first().click();

  await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
  await page.getByLabel('Nome da unidade').fill('Quarto 101');
  await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await expect(page.locator('#stay-unit option').filter({ hasText: 'Quarto 101' })).toBeAttached();

  const book = async (guest: string, checkIn: string, checkOut: string) => {
    if (!await page.locator('#stay-unit').isVisible()) await page.getByRole('button', { name: 'Nova reserva' }).click();
    await page.locator('#stay-unit').selectOption({ label: 'Quarto 101' });
    await page.locator('#stay-guest').fill(guest);
    await page.locator('#stay-in').fill(checkIn);
    await page.locator('#stay-out').fill(checkOut);
    await page.getByRole('button', { name: 'Registrar reserva' }).click();
  };
  await book('Hóspede original', '2030-06-10', '2030-06-12');
  const first = page.locator('article').filter({ hasText: 'Hóspede original' });
  await expect(first).toContainText('10/06/2030 a 12/06/2030');
  await page.getByLabel('A partir de', { exact: true }).fill('2030-06-10');
  const occupancy = page.getByRole('table', { name: /Disponibilidade de unidades/ }).getByRole('row').filter({ hasText: 'Quarto 101' });
  await expect(occupancy.getByRole('cell').nth(0)).toHaveText('Ocupada');
  await expect(occupancy.getByRole('cell').nth(1)).toHaveText('Ocupada');
  await expect(occupancy.getByRole('cell').nth(2)).toHaveText('Sem reserva');
  await page.getByRole('button', { name: 'Próximas 14 noites' }).click();
  await expect(page.getByLabel('A partir de', { exact: true })).toHaveValue('2030-06-24');
  await page.getByRole('button', { name: '14 noites anteriores' }).click();
  await expect(page.getByLabel('A partir de', { exact: true })).toHaveValue('2030-06-10');
  await first.getByRole('button', { name: 'Registrar chegada' }).click();
  if (await first.getByRole('button', { name: 'Confirmar registro' }).isVisible()) await first.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(first).toContainText('Hóspede presente');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir operação' }).first().click();
  await expect(first).toContainText('Hóspede presente');

  await book('Hóspede em conflito', '2030-06-11', '2030-06-13');
  await expect(page.getByRole('alert')).toContainText('já está reservada');
  await expect(page.locator('article').filter({ hasText: 'Hóspede em conflito' })).toHaveCount(0);

  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await first.getByRole('button', { name: 'Registrar saída' }).click();
  if (await first.getByRole('button', { name: 'Confirmar registro' }).isVisible()) await first.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(first).toContainText('Estadia encerrada');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir operação' }).first().click();
  await expect(first).toContainText('Estadia encerrada');
  await book('Conflito após saída', '2030-06-11', '2030-06-12');
  await expect(page.getByRole('alert')).toContainText('já está reservada');
  await expect(page.locator('article').filter({ hasText: 'Conflito após saída' })).toHaveCount(0);

  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await book('Hóspede seguinte', '2030-06-12', '2030-06-14');
  const second = page.locator('article').filter({ hasText: 'Hóspede seguinte' });
  await expect(second).toContainText('12/06/2030 a 14/06/2030');
  await page.getByLabel('Buscar hóspede').fill('seguinte');
  await expect(first).toHaveCount(0);
  await expect(second).toBeVisible();
  await page.getByLabel('Buscar hóspede').fill('');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir operação' }).first().click();
  await expect(first).toContainText('Estadia encerrada');
  await expect(second).toContainText('Confirmada');
  await expect(page.locator('article')).toHaveCount(2);
  await page.getByLabel('A partir de', { exact: true }).fill('2030-06-10');
  await expect(occupancy.getByRole('cell').nth(2)).toHaveText('Ocupada');
  await second.getByRole('button', { name: 'Cancelar reserva' }).click();
  await second.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(second).toContainText('Cancelada');
  await expect(occupancy.getByRole('cell').nth(2)).toHaveText('Sem reserva');
  await page.getByText('Novo bloqueio', { exact: true }).click();
  await page.getByLabel('Unidade do bloqueio').selectOption({ label: 'Quarto 101' });
  await page.getByLabel('Primeiro dia bloqueado').fill('2030-06-12');
  await page.getByLabel('Liberar a partir de').fill('2030-06-14');
  await page.getByLabel('Motivo').fill('Manutenção fictícia');
  await page.getByRole('button', { name: 'Registrar bloqueio' }).click();
  const block = page.locator('article').filter({ hasText: 'Manutenção fictícia' });
  await expect(block).toContainText('Ativo');
  await expect(occupancy.getByRole('cell').nth(2)).toHaveText('Bloqueada');
  await book('Conflito com manutenção', '2030-06-12', '2030-06-13');
  await expect(page.getByRole('alert')).toContainText('bloqueada');
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await block.getByRole('button', { name: 'Cancelar bloqueio' }).click();
  await block.getByRole('button', { name: 'Confirmar cancelamento do bloqueio' }).click();
  await expect(block).toContainText('Cancelado');
  await expect(occupancy.getByRole('cell').nth(2)).toHaveText('Sem reserva');
  if (process.env.OVERTRIP_E2E_PLATFORM_ONLY === '1') {
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await page.getByLabel('E-mail').fill('outra-e2e@example.test');
    await page.getByLabel('Senha', { exact: true }).fill('senha-e2e-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Outra pousada E2E' })).toBeVisible();
    await expect(page.getByText('Nenhuma reserva registrada.')).toBeVisible();
    await expect(page.getByText('Quarto 101')).toHaveCount(0);
    await expect(page.getByText('Hóspede original')).toHaveCount(0);
  }
});
