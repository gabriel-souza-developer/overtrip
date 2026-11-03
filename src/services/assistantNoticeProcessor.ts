import { claimAssistantNotice, finishAssistantNotice } from './assistantNoticeQueue.js';

/** O adaptador deve usar noticeId como chave de idempotência quando possível.
 * Não recebe texto de conversa; resolve destinatário pelo canal autorizado. */
export interface AssistantNoticeSender {
  send(input: { noticeId: string; conversationId: string; signal: AbortSignal }): Promise<void>;
}

/** Uma tentativa por chamada; nenhuma integração ou processo é iniciado aqui. */
export async function processAssistantNotice(sender: AssistantNoticeSender, timeoutMs = 15_000) {
  const claim = await claimAssistantNotice();
  if (!claim) return 'idle' as const;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sender.send({ noticeId: claim.id, conversationId: claim.conversationId, signal: controller.signal }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('NOTICE_TIMEOUT')); }, timeoutMs); }),
    ]);
  } catch {
    const recorded = await finishAssistantNotice(claim.id, claim.token, 'failed');
    return recorded ? 'retry' as const : 'superseded' as const;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const recorded = await finishAssistantNotice(claim.id, claim.token, 'sent');
  return recorded ? 'sent' as const : 'superseded' as const;
}
