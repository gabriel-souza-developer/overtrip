import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { config } from '../src/config.js';
import { hashToken, waitForPendingSends } from '../src/services/passwordResetService.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  // Nunca herdar credenciais reais do ambiente, inclusive no primeiro teste.
  config.brevoApiKey = null;
  config.brevoSenderEmail = null;
});

afterEach(() => {
  config.brevoApiKey = null;
  config.brevoSenderEmail = null;
});

const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createUser(overrides: Partial<{ email: string; password: string }> = {}) {
  const password = overrides.password ?? 'senha-antiga-123';
  const passwordHash = await bcrypt.hash(password, 10);
  const email = overrides.email ?? `user-${suffix()}@example.com`;
  const user = await prisma.user.create({ data: { email, passwordHash, name: 'Usuária de teste' } });
  return { user, password };
}

function configureBrevo() {
  config.brevoApiKey = 'fake-brevo-key-for-tests';
  config.brevoSenderEmail = 'nao-responda@example.com';
}

const forgotPassword = (email: string) => fetch(`${baseUrl}/api/auth/forgot-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
});

const resetPassword = (token: string, newPassword: string) => fetch(`${baseUrl}/api/auth/reset-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword }),
});

const login = (email: string, password: string) => fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
});

async function seedToken(userId: string, rawToken: string, expiresAt: Date, usedAt: Date | null = null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(rawToken), expiresAt, usedAt, issuedForUpdatedAt: user.updatedAt },
  });
}

describe('POST /api/auth/forgot-password e /api/auth/reset-password (HTTP real)', () => {
  describe('indisponibilidade (sem Brevo configurado)', () => {
    it('responde 503 com mensagem clara, igual para conta existente e inexistente, e não cria token', async () => {
      const { user } = await createUser();
      try {
        const existing = await forgotPassword(user.email);
        const missing = await forgotPassword(`nao-existe-${suffix()}@example.com`);
        expect(existing.status).toBe(503);
        expect(missing.status).toBe(503);
        const [existingBody, missingBody] = await Promise.all([existing.json(), missing.json()]);
        expect(existingBody).toEqual(missingBody);
        expect(existingBody.error).toMatch(/indisponível/i);

        const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
        expect(tokens).toHaveLength(0);
      } finally { await prisma.user.delete({ where: { id: user.id } }); }
    });
  });

  describe('proteção contra enumeração (com Brevo configurado)', () => {
    it('responde a mesma mensagem genérica (200) para e-mail com e sem conta', async () => {
      configureBrevo();
      const originalFetch = globalThis.fetch;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (String(url).includes('api.brevo.com')) return new Response(null, { status: 200 });
        return originalFetch(url as never, init); // deixa passar as chamadas HTTP do próprio teste
      });
      const { user } = await createUser();
      try {
        const existing = await forgotPassword(user.email);
        const missing = await forgotPassword(`nao-existe-${suffix()}@example.com`);
        expect(existing.status).toBe(200);
        expect(missing.status).toBe(200);
        const [existingBody, missingBody] = await Promise.all([existing.json(), missing.json()]);
        expect(existingBody).toEqual(missingBody);

        // Por dentro, só a conta existente ganhou um token — a diferença nunca aparece na resposta.
        const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
        expect(tokens).toHaveLength(1);
      } finally {
        // Espera o envio em segundo plano antes de restaurar o fetch: um job
        // ainda pendente que disparasse depois, sem o spy, bateria de verdade
        // em api.brevo.com.
        await waitForPendingSends();
        fetchSpy.mockRestore();
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it('mesmo se o envio pela Brevo falhar, a resposta ao cliente continua a mesma genérica, e o token criado é descartado', async () => {
      configureBrevo();
      const originalFetch = globalThis.fetch;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (String(url).includes('api.brevo.com')) return new Response(null, { status: 500 });
        return originalFetch(url as never, init);
      });
      const { user } = await createUser();
      try {
        const res = await forgotPassword(user.email);
        expect(res.status).toBe(200);
        expect((await res.json()).message).toMatch(/se existir uma conta/i);

        // O envio falhou em segundo plano: o token criado para esta
        // solicitação não deve continuar válido esperando ser usado.
        await waitForPendingSends();
        const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
        expect(tokens).toHaveLength(1);
        expect(tokens[0].usedAt).toBeTruthy();
      } finally {
        await waitForPendingSends();
        fetchSpy.mockRestore();
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });
  });

  describe('resposta independente da latência do provedor (fila assíncrona)', () => {
    it('conta existente responde tão rápido quanto inexistente mesmo com a Brevo travada', async () => {
      configureBrevo();
      const originalFetch = globalThis.fetch;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (String(url).includes('api.brevo.com')) {
          // Provedor lento (2s), bem mais que o orçamento de resposta esperado.
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return new Response(null, { status: 200 });
        }
        return originalFetch(url as never, init);
      });
      const { user } = await createUser();
      try {
        const startExisting = Date.now();
        const existing = await forgotPassword(user.email);
        const existingMs = Date.now() - startExisting;

        const startMissing = Date.now();
        const missing = await forgotPassword(`nao-existe-${suffix()}@example.com`);
        const missingMs = Date.now() - startMissing;

        expect(existing.status).toBe(200);
        expect(missing.status).toBe(200);
        // A chamada à Brevo nunca é esperada pela resposta: ambas voltam bem
        // antes dos 2s que o provedor "lento" levaria para responder.
        expect(existingMs).toBeLessThan(500);
        expect(Math.abs(existingMs - missingMs)).toBeLessThan(200);
      } finally {
        await waitForPendingSends();
        fetchSpy.mockRestore();
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });
  });

  describe('validade e efeitos da redefinição', () => {
    it('token válido redefine a senha, permite login com a nova senha e invalida a sessão antiga', async () => {
      const { user, password: oldPassword } = await createUser();
      try {
        const loginRes = await login(user.email, oldPassword);
        expect(loginRes.status).toBe(200);
        const oldToken = loginRes.headers.get('set-cookie')?.match(/overtrip_session=([^;]+)/)?.[1];
        expect(oldToken).toBeTruthy();

        const rawToken = 'teste-token-valido-' + suffix();
        await seedToken(user.id, rawToken, new Date(Date.now() + 30 * 60 * 1000));

        const reset = await resetPassword(rawToken, 'senha-nova-456');
        expect(reset.status).toBe(200);

        const oldLogin = await login(user.email, oldPassword);
        expect(oldLogin.status).toBe(401);
        const newLogin = await login(user.email, 'senha-nova-456');
        expect(newLogin.status).toBe(200);

        // Sessão emitida antes da redefinição não serve mais (updatedAt mudou).
        const meWithOldSession = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Cookie: `overtrip_session=${oldToken}` },
        });
        expect(meWithOldSession.status).toBe(401);
      } finally { await prisma.user.delete({ where: { id: user.id } }); }
    });

    it('expiração: token vencido é rejeitado com mensagem genérica e não altera a senha', async () => {
      const { user, password: oldPassword } = await createUser();
      try {
        const rawToken = 'teste-token-expirado-' + suffix();
        await seedToken(user.id, rawToken, new Date(Date.now() - 1000));

        const reset = await resetPassword(rawToken, 'senha-nova-456');
        expect(reset.status).toBe(400);
        expect((await reset.json()).code).toBe('INVALID_RESET_TOKEN');

        const stillOld = await login(user.email, oldPassword);
        expect(stillOld.status).toBe(200);
      } finally { await prisma.user.delete({ where: { id: user.id } }); }
    });

    it('reuso: um token já consumido não pode redefinir a senha de novo', async () => {
      const { user } = await createUser();
      try {
        const rawToken = 'teste-token-reuso-' + suffix();
        await seedToken(user.id, rawToken, new Date(Date.now() + 30 * 60 * 1000));

        const first = await resetPassword(rawToken, 'senha-nova-456');
        expect(first.status).toBe(200);

        const second = await resetPassword(rawToken, 'outra-senha-789');
        expect(second.status).toBe(400);
        expect((await second.json()).code).toBe('INVALID_RESET_TOKEN');

        // A senha continua sendo a do primeiro reset, não a do segundo.
        const loginFirst = await login(user.email, 'senha-nova-456');
        expect(loginFirst.status).toBe(200);
      } finally { await prisma.user.delete({ where: { id: user.id } }); }
    });

    it('token de um usuário não serve para redefinir a senha de outro (isolamento multiagência)', async () => {
      const orgSuffix = suffix();
      const orgA = await prisma.organization.create({ data: { name: 'Agência A', slug: `agencia-a-${orgSuffix}` } });
      const orgB = await prisma.organization.create({ data: { name: 'Agência B', slug: `agencia-b-${orgSuffix}` } });
      const { user: userA, password: passwordA } = await createUser();
      const { user: userB, password: passwordB } = await createUser();
      try {
        await prisma.membership.create({ data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' } });
        await prisma.membership.create({ data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' } });

        const rawTokenA = 'teste-token-org-a-' + suffix();
        await seedToken(userA.id, rawTokenA, new Date(Date.now() + 30 * 60 * 1000));

        const reset = await resetPassword(rawTokenA, 'senha-nova-456');
        expect(reset.status).toBe(200);

        // Usuária B, de outra agência, é intocada: senha antiga ainda funciona.
        const loginB = await login(userB.email, passwordB);
        expect(loginB.status).toBe(200);
        const loginA = await login(userA.email, passwordA);
        expect(loginA.status).toBe(401);
      } finally {
        await prisma.membership.deleteMany({ where: { OR: [{ userId: userA.id }, { userId: userB.id }] } });
        await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
        await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
      }
    });

    it('concorrência: duas requisições simultâneas com o mesmo token só uma vence', async () => {
      const { user } = await createUser();
      try {
        const rawToken = 'teste-token-concorrencia-' + suffix();
        await seedToken(user.id, rawToken, new Date(Date.now() + 30 * 60 * 1000));

        const [resA, resB] = await Promise.all([
          resetPassword(rawToken, 'senha-concorrente-A'),
          resetPassword(rawToken, 'senha-concorrente-B'),
        ]);

        const statuses = [resA.status, resB.status].sort();
        expect(statuses).toEqual([200, 400]);

        const winningPassword = resA.status === 200 ? 'senha-concorrente-A' : 'senha-concorrente-B';
        const loginWinner = await login(user.email, winningPassword);
        expect(loginWinner.status).toBe(200);

        const tokenRow = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
        expect(tokenRow?.usedAt).toBeTruthy();
      } finally { await prisma.user.delete({ where: { id: user.id } }); }
    });

    it('token inexistente é rejeitado com a mesma mensagem genérica (não distingue de expirado/reusado)', async () => {
      const res = await resetPassword('token-que-nunca-existiu-' + suffix(), 'senha-nova-456');
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('INVALID_RESET_TOKEN');
    });
  });

  describe('validação e proteção de origem', () => {
    it('responde 400 para e-mail inválido em forgot-password', async () => {
      const res = await forgotPassword('isto-nao-e-email');
      expect(res.status).toBe(400);
    });

    it('responde 400 para senha fora da política em reset-password', async () => {
      const res = await resetPassword('qualquer-token', 'curta');
      expect(res.status).toBe(400);
    });

    it('rejeita Origin diferente do painel em forgot-password e reset-password', async () => {
      const forgot = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.example' },
        body: JSON.stringify({ email: 'alguem@example.com' }),
      });
      expect(forgot.status).toBe(403);

      const reset = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.example' },
        body: JSON.stringify({ token: 'x', newPassword: 'senha-nova-456' }),
      });
      expect(reset.status).toBe(403);
    });
  });
});
