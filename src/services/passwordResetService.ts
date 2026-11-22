import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { sendPasswordResetEmail, isBrevoConfigured } from './brevoClient.js';
import { createBoundedQueue } from './boundedQueue.js';

const RAW_TOKEN_BYTES = 32;

/** Exportado só para os testes seedarem um PasswordResetToken com um token bruto conhecido. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString('base64url');
}

/**
 * Invalida (usedAt) todos os tokens de redefinição ainda pendentes do
 * usuário. Chamado sempre que a senha muda, por qualquer caminho (reset ou
 * troca autenticada): um token emitido antes da troca não pode sobreviver a
 * ela. Recebe o client da transação em curso para ficar atômico com a troca.
 */
export async function invalidatePendingResetTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
}

// Nenhum motivo para um token consumido ou vencido continuar na tabela por
// muito tempo (nem para auditoria): limpa oportunisticamente a cada
// solicitação, então o volume fica proporcional ao uso, nunca ilimitado.
const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

async function cleanupOldTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - CLEANUP_GRACE_MS);
  await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
  });
}

// O envio real nunca é esperado por requestPasswordReset: só é agendado
// aqui. É isso que faz uma conta existente e uma inexistente responderem no
// mesmo tempo mesmo com o provedor lento, travado ou fora do ar — a
// latência do provedor nunca entra no caminho síncrono da requisição
// (withMinimumDuration abaixo só cobre a diferença mínima entre as duas
// consultas ao banco, não mais a rede). O limite de concorrência e de
// tamanho da fila é o controle de abuso deste lado: mesmo que o rate
// limiter por IP/e-mail (ver rateLimit.ts) deixe passar um volume alto de
// contas reais distintas, o processo nunca acumula conexões concorrentes
// ou trabalho pendente sem teto.
const EMAIL_SEND_CONCURRENCY = 3;
const EMAIL_SEND_MAX_QUEUE = 200;
const emailSendQueue = createBoundedQueue({ concurrency: EMAIL_SEND_CONCURRENCY, maxQueueSize: EMAIL_SEND_MAX_QUEUE });

/**
 * Só para os testes: espera o(s) envio(s) em segundo plano (sucesso ou
 * falha) terminarem antes de inspecionar efeitos — token descartado,
 * chamada ao provedor feita/não feita etc. Nunca chamado em código de
 * produção: a resposta ao cliente não espera por isto.
 */
export function waitForPendingSends(): Promise<void> {
  return emailSendQueue.idle();
}

async function discardToken(tokenHash: string): Promise<void> {
  await prisma.passwordResetToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: new Date() } });
}

// Só cobre a pequena folga de uma consulta/escrita extra no banco (conta
// existente grava um token; inexistente não) — não a rede, que já saiu do
// caminho síncrono (ver emailSendQueue acima).
const MIN_REQUEST_DURATION_MS = 50;

async function withMinimumDuration<T>(minMs: number, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  if (elapsed < minMs) await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  return result;
}

export type RequestResetOutcome = 'sent' | 'no_account' | 'unavailable';

/**
 * Solicita a redefinição de senha. O resultado aqui é só para quem chama
 * decidir o que registrar/testar: o controller sempre devolve a MESMA
 * mensagem genérica (condicional: "se existir uma conta...") para 'sent' e
 * 'no_account' — inclusive quando o envio à Brevo falhar depois, para uma
 * conta que existe (nunca promete confirmação de entrega que não
 * aconteceu; só afirma a condição, que é sempre verdadeira). 'unavailable'
 * é decidido ANTES de olhar a conta, então também não distingue e-mails —
 * é seguro expor com clareza. O envio em si é agendado na fila e nunca
 * aguardado aqui (ver emailSendQueue): nenhum e-mail é enviado para um
 * endereço sem conta (a função já retornou 'no_account' antes de chegar
 * lá), e uma falha no envio descarta o token (ver discardToken) em vez de
 * deixá-lo válido sem nunca ter sido entregue.
 */
type CreateTokenOutcome =
  | { kind: 'no_account' }
  | { kind: 'queue_full' }
  | { kind: 'created'; rawToken: string; tokenHash: string; recipient: string };

export async function requestPasswordReset(
  email: string,
  deps: { fetchFn?: typeof fetch; timeoutMs?: number; minDurationMs?: number } = {}
): Promise<RequestResetOutcome> {
  return withMinimumDuration(deps.minDurationMs ?? MIN_REQUEST_DURATION_MS, async () => {
    if (!isBrevoConfigured()) return 'unavailable';

    await cleanupOldTokens();

    const normalized = email.trim();

    // Emite o token com a versão atual da credencial, na mesma transação
    // da leitura. Trocas de senha incrementam essa versão; logout apenas
    // altera a versão de sessão. A comparação no consumo fecha corridas.
    // Confere também a capacidade da fila antes de criar o token.
    const result: CreateTokenOutcome = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email: normalized } })
        ?? (normalized !== normalized.toLowerCase()
          ? await tx.user.findUnique({ where: { email: normalized.toLowerCase() } })
          : null);

      if (!user) return { kind: 'no_account' };
      if (!emailSendQueue.hasRoom()) return { kind: 'queue_full' };

      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + config.passwordResetTokenTtlMinutes * 60 * 1000);

      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt, issuedForUpdatedAt: user.updatedAt, issuedCredentialVersion: user.credentialVersion },
      });

      return { kind: 'created', rawToken, tokenHash, recipient: user.email };
    });

    if (result.kind === 'no_account') return 'no_account';
    if (result.kind === 'queue_full') {
      console.error('Fila de envio de redefinição de senha saturada; solicitação descartada sem criar token.');
      return 'sent';
    }

    const { rawToken, tokenHash, recipient } = result;

    // Fragmento (#), não query string (?): o navegador nunca envia o fragmento
    // ao servidor (logs de acesso, proxies, CDN) nem no cabeçalho Referer.
    const resetUrl = `${config.passwordResetUrlBase}/redefinir-senha#token=${encodeURIComponent(rawToken)}`;

    const enqueued = emailSendQueue.enqueue(async () => {
      const sendResult = await sendPasswordResetEmail({ to: recipient, resetUrl }, deps);
      if (!sendResult.ok) {
        // Nunca o token ou o e-mail aqui: só o motivo, para quem opera notar
        // falhas de entrega. O cliente não é informado da falha específica
        // (ver comentário da função): revelar isso só para contas existentes
        // reabriria a enumeração que a mensagem genérica evita.
        console.error('Falha ao enviar e-mail de redefinição de senha.', { reason: sendResult.reason });
        await discardToken(tokenHash);
      }
    });
    if (!enqueued) {
      // Janela residual entre hasRoom() (dentro da transação) e este
      // enqueue: outra solicitação pode ter ocupado a última vaga nesse
      // meio-tempo. Mesmo tratamento do caso 'queue_full' acima, só que o
      // token já tinha sido criado — descarta.
      console.error('Fila de envio de redefinição de senha cheia; solicitação descartada.');
      await discardToken(tokenHash);
    }

    return 'sent';
  });
}

export type ResetPasswordOutcome = 'success' | 'invalid';

/**
 * Consome o token e troca a senha de forma atômica (mesma transação): ou os
 * dois efeitos acontecem juntos, ou nenhum acontece. A condição `usedAt:
 * null` no updateMany é quem garante uso único sob concorrência — a segunda
 * tentativa com o mesmo token nunca encontra linha para atualizar.
 *
 * A versão de credencial é independente da versão de sessão: logout não
 * invalida o link, mas qualquer troca de senha incrementa a versão e invalida
 * inclusive tokens inseridos em concorrência após a varredura de invalidação.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<ResetPasswordOutcome> {
  const tokenHash = hashToken(rawToken);
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  return prisma.$transaction(async (tx) => {
    const tokenRow = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt.getTime() <= Date.now()) {
      return 'invalid';
    }

    const user = await tx.user.findUnique({ where: { id: tokenRow.userId } });
    if (!user) return 'invalid';

    if (tokenRow.issuedCredentialVersion !== user.credentialVersion) {
      return 'invalid';
    }

    const now = new Date();
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: tokenRow.id, usedAt: null },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return 'invalid';

    // updatedAt é a "versão de sessão" embutida no JWT (ver middleware/auth.ts):
    // trocá-la invalida todas as sessões já emitidas, igual ao changePassword.
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        credentialVersion: { increment: 1 },
        updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1, now.getTime() + 1)),
      },
    });

    // Outros tokens pendentes do mesmo usuário não continuam válidos depois
    // de uma redefinição concluída.
    await invalidatePendingResetTokens(tx, tokenRow.userId, now);

    return 'success';
  });
}
