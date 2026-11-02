/** Lógica interna; o adaptador futuro deve autenticar os eventos da equipe. */
export type HandoffState = 'ASSISTANT' | 'WAITING_NOTIFICATION' | 'WAITING_HUMAN' | 'HUMAN';
export type HandoffEvent =
  | 'REQUEST_HUMAN'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_FAILED'
  | 'HUMAN_ASSUMED'
  | 'HUMAN_RELEASED';

export interface HandoffTransition {
  state: HandoffState;
  assistantMayReply: boolean;
  notificationRequired: boolean;
}

/** Confirmação de envio de aviso não significa que alguém assumiu a conversa.
 * Não há retorno por timeout: a equipe precisa liberá-la explicitamente.
 * Confirmações de aviso duplicadas não reativam o bot nem reabrem uma fila.
 */
export function transitionHandoff(state: HandoffState, event: HandoffEvent): HandoffTransition {
  let next = state;
  if (event === 'HUMAN_ASSUMED') next = 'HUMAN';
  else if (event === 'HUMAN_RELEASED' && state !== 'ASSISTANT') next = 'ASSISTANT';
  else if (event === 'REQUEST_HUMAN' && state === 'ASSISTANT') next = 'WAITING_NOTIFICATION';
  else if (event === 'NOTIFICATION_SENT' && state === 'WAITING_NOTIFICATION') next = 'WAITING_HUMAN';

  return {
    state: next,
    assistantMayReply: next === 'ASSISTANT',
    notificationRequired: next === 'WAITING_NOTIFICATION',
  };
}
