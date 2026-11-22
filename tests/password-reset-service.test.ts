import { describe, it, expect, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { config } from '../src/config.js';
import {
  requestPasswordReset,
  resetPassword,
  hashToken,
  waitForPendingSends,
  invalidatePendingResetTokens,
} from '../src/services/passwordResetService.js';
import { sendPasswordResetEmail } from '../src/services/brevoClient.js';

afterEach(() => {
  config.brevoApiKey = null;
  config.brevoSenderEmail = null;
});

const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createUser() {
  const passwordHash = await bcrypt.hash('senha-qualquer-123', 10);
  return prisma.user.create({ data: { email: `user-${suffix()}@example.com`, passwordHash, name: 'Usuária' } });
}

function configureBrevo() {
  config.brevoApiKey = 'fake-key';
  config.brevoSenderEmail = 'nao-responda@example.com';
}

describe('requestPasswordReset: URL gerada', () => {
  it('usa fragmento (#token=), inclui PASSWORD_RESET_URL_BASE (com /admin) sem barra duplicada', async () => {
    configureBrevo();
    const originalBase = config.passwordResetUrlBase;
    config.passwordResetUrlBase = 'https://admin.example.test/admin';

    let capturedBody: string | undefined;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const user = await createUser();
    try {
      await requestPasswordReset(user.email, { fetchFn, minDurationMs: 0 });
      await waitForPendingSends(); // o envio agora é assíncrono: espera o job rodar antes de inspecionar o corpo capturado.
      expect(capturedBody).toBeTruthy();
      const payload = JSON.parse(capturedBody!);
      const match = String(payload.textContent).match(/Acesse para criar uma nova senha: (\S+)/);
      expect(match).toBeTruthy();
      const url = match![1];
      expect(url.startsWith('https://admin.example.test/admin/redefinir-senha#token=')).toBe(true);
      expect(url).not.toContain('/admin//'); // sem barra duplicada
      expect(url).not.toContain('?token='); // fragmento, não query string
    } finally {
      config.passwordResetUrlBase = originalBase;
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

describe('requestPasswordReset: timing/consistência', () => {
  it('aplica o piso mínimo de duração mesmo quando o envio é instantâneo', async () => {
    configureBrevo();
    const fetchFn = (async () => new Response(null, { status: 200 })) as typeof fetch;
    const user = await createUser();
    try {
      const start = Date.now();
      await requestPasswordReset(user.email, { fetchFn, minDurationMs: 120 });
      expect(Date.now() - start).toBeGreaterThanOrEqual(110);
    } finally {
      await waitForPendingSends();
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('conta existente responde tão rápido quanto inexistente mesmo com o provedor lento (envio real nunca é esperado pela resposta)', async () => {
    configureBrevo();
    // Resolve, mas bem mais lento que o orçamento de resposta esperado —
    // finito, para não deixar um job pendente para sempre na fila (o que
    // travaria waitForPendingSends() de outros testes neste arquivo).
    const slowFetch = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const user = await createUser();
    try {
      const t0 = Date.now();
      const existingOutcome = await requestPasswordReset(user.email, { fetchFn: slowFetch, minDurationMs: 0 });
      const existingMs = Date.now() - t0;

      const t1 = Date.now();
      const missingOutcome = await requestPasswordReset(`nao-existe-${suffix()}@example.com`, { fetchFn: slowFetch, minDurationMs: 0 });
      const missingMs = Date.now() - t1;

      expect(existingOutcome).toBe('sent');
      expect(missingOutcome).toBe('no_account');
      expect(existingMs).toBeLessThan(200);
      expect(Math.abs(existingMs - missingMs)).toBeLessThan(100);
    } finally {
      await waitForPendingSends();
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

describe('requestPasswordReset: nunca chama o provedor para e-mail sem conta', () => {
  it('conta inexistente não gera nenhuma chamada de envio, nem depois de esperar a fila', async () => {
    configureBrevo();
    let calls = 0;
    const fetchFn = (async () => { calls++; return new Response(null, { status: 200 }); }) as typeof fetch;
    const outcome = await requestPasswordReset(`nao-existe-${suffix()}@example.com`, { fetchFn, minDurationMs: 0 });
    await waitForPendingSends();
    expect(outcome).toBe('no_account');
    expect(calls).toBe(0);
  });
});

describe('requestPasswordReset: Brevo falhando não promete envio falsamente, mas não vaza por enumeração', () => {
  it('registra o motivo da falha, devolve "sent" (controller usa mensagem condicional, nunca afirmativa) e descarta o token', async () => {
    configureBrevo();
    const fetchFn = (async () => new Response(null, { status: 500 })) as typeof fetch;
    const user = await createUser();
    const errorSpy = [] as unknown[];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errorSpy.push(args); };
    try {
      const outcome = await requestPasswordReset(user.email, { fetchFn, minDurationMs: 0 });
      expect(outcome).toBe('sent');

      // O envio falha em segundo plano: espera a fila antes de checar efeitos.
      await waitForPendingSends();
      expect(errorSpy.some((call) => String(call).includes('send_failed') || JSON.stringify(call).includes('send_failed'))).toBe(true);

      const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].usedAt).toBeTruthy(); // descartado: nunca foi entregue, não deve continuar válido.
    } finally {
      console.error = originalError;
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

describe('sendPasswordResetEmail: timeout', () => {
  it('não trava indefinidamente quando a rede não responde; aborta e reporta network_error', async () => {
    configureBrevo();
    const hangingFetch = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;

    const start = Date.now();
    const result = await sendPasswordResetEmail(
      { to: 'alguem@example.test', resetUrl: 'https://example.test/redefinir-senha#token=x' },
      { fetchFn: hangingFetch, timeoutMs: 50 }
    );
    expect(Date.now() - start).toBeLessThan(2000);
    expect(result).toEqual({ ok: false, reason: 'network_error' });
  });
});

describe('requestPasswordReset: limpeza de tokens antigos', () => {
  it('remove tokens vencidos/usados há muito tempo ao processar uma nova solicitação', async () => {
    configureBrevo();
    const fetchFn = (async () => new Response(null, { status: 200 })) as typeof fetch;
    const user = await createUser();
    try {
      const longAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const old = await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken('token-antigo-' + suffix()), expiresAt: longAgo, issuedForUpdatedAt: user.updatedAt },
      });

      await requestPasswordReset(user.email, { fetchFn, minDurationMs: 0 });

      const stillThere = await prisma.passwordResetToken.findUnique({ where: { id: old.id } });
      expect(stillThere).toBeNull();
    } finally {
      await waitForPendingSends();
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

// Corrida: a solicitação lê o usuário (versão V0), uma troca de senha
// concorrente conclui e invalida os tokens pendentes (que ainda não incluem
// este, inexistente até então) e SÓ DEPOIS a solicitação grava um token
// novo com a versão já obsoleta (V0). A varredura de invalidação não via
// esse token (não existia ainda), então ele fica usedAt: null. Reproduzido
// aqui de forma determinística (grava o estado final da corrida direto),
// em vez de tentar vencer uma corrida de verdade, que seria instável.
describe('resetPassword: fecha a corrida de emissão com troca de senha concorrente (versão de credencial)', () => {
  it('token emitido com versão anterior a uma troca autenticada concorrente é rejeitado no consumo, mesmo com usedAt ainda null', async () => {
    const user = await createUser();
    try {
      const staleVersion = user.updatedAt;

      // Troca de senha autenticada concluindo ANTES do token ser gravado.
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date(staleVersion.getTime() + 5000) } });
        await invalidatePendingResetTokens(tx, user.id);
      });

      const rawToken = 'token-apos-troca-concorrente-' + suffix();
      const tokenRow = await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          issuedForUpdatedAt: staleVersion, // versão que a solicitação "viu", já obsoleta
        },
      });
      expect(tokenRow.usedAt).toBeNull(); // confirma: a varredura de invalidação não alcançou este token

      const outcome = await resetPassword(rawToken, 'senha-via-token-obsoleto-456');
      expect(outcome).toBe('invalid'); // rejeitado pela checagem de versão, não pela varredura

      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await bcrypt.compare('senha-via-token-obsoleto-456', unchanged.passwordHash)).toBe(false);
    } finally { await prisma.user.delete({ where: { id: user.id } }); }
  });

  it('mesma corrida com uma redefinição concorrente (resetPassword com outro token) no lugar da troca autenticada', async () => {
    const user = await createUser();
    try {
      const staleVersion = user.updatedAt;

      const otherRawToken = 'outro-token-valido-' + suffix();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id, tokenHash: hashToken(otherRawToken),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), issuedForUpdatedAt: staleVersion,
        },
      });
      expect(await resetPassword(otherRawToken, 'senha-concorrente-999')).toBe('success');

      // Token da solicitação "atrasada", gravado só depois, ainda com a
      // versão vista antes do reset concorrente concluir.
      const rawToken = 'token-apos-reset-concorrente-' + suffix();
      const tokenRow = await prisma.passwordResetToken.create({
        data: {
          userId: user.id, tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), issuedForUpdatedAt: staleVersion,
        },
      });
      expect(tokenRow.usedAt).toBeNull();

      const outcome = await resetPassword(rawToken, 'senha-via-token-obsoleto-outra-456');
      expect(outcome).toBe('invalid');

      const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await bcrypt.compare('senha-concorrente-999', current.passwordHash)).toBe(true);
    } finally { await prisma.user.delete({ where: { id: user.id } }); }
  });
});

describe('requestPasswordReset: concorrência real com troca de senha (leitura e criação atômicas)', () => {
  it('disparando os dois ao mesmo tempo, nenhum token pendente fica com versão desatualizada da credencial', async () => {
    configureBrevo();
    const fetchFn = (async () => new Response(null, { status: 200 })) as typeof fetch;
    const user = await createUser();
    try {
      const concurrentPasswordChange = prisma.$transaction(async (tx) => {
        const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date(current.updatedAt.getTime() + 1) } });
        await invalidatePendingResetTokens(tx, user.id);
      });

      await Promise.all([
        requestPasswordReset(user.email, { fetchFn, minDurationMs: 0 }),
        concurrentPasswordChange,
      ]);
      await waitForPendingSends();

      const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
      const freshUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      for (const token of tokens) {
        // Invariante central: nenhum token PENDENTE (usedAt null) pode ter
        // uma versão de credencial diferente da atual — se tivesse, seria
        // exatamente a corrida que este teste existe para prevenir.
        if (token.usedAt === null) {
          expect(token.issuedForUpdatedAt.getTime()).toBe(freshUser.updatedAt.getTime());
        }
      }
    } finally {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
