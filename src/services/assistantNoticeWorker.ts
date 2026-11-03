import { setTimeout as delay } from 'node:timers/promises';
import { processAssistantNotice, type AssistantNoticeSender } from './assistantNoticeProcessor.js';

/** Loop injetável; encerramento aguarda a tentativa em curso, limitada pelo processador. */
export async function runAssistantNoticeWorker(sender: AssistantNoticeSender, signal: AbortSignal, intervalMs = 5000) {
  while (!signal.aborted) {
    try {
      if (await processAssistantNotice(sender) === 'sent') continue;
    } catch {
      // Não registrar erros do adaptador nem conteúdo de clientes.
      console.error('Falha no processamento de avisos.');
    }
    try { await delay(intervalMs, undefined, { signal }); } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}
