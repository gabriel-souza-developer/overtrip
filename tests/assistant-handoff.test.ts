import { describe, expect, it } from 'vitest';
import { transitionHandoff, type HandoffState } from '../src/services/assistantHandoff.js';

describe('transferência interna ao atendimento humano', () => {
  it('distingue solicitar, avisar e assumir, mantendo o bot pausado', () => {
    const requested = transitionHandoff('ASSISTANT', 'REQUEST_HUMAN');
    expect(requested).toEqual({ state: 'WAITING_NOTIFICATION', assistantMayReply: false, notificationRequired: true });
    const notified = transitionHandoff(requested.state, 'NOTIFICATION_SENT');
    expect(notified).toEqual({ state: 'WAITING_HUMAN', assistantMayReply: false, notificationRequired: false });
    expect(transitionHandoff(notified.state, 'HUMAN_ASSUMED').state).toBe('HUMAN');
  });

  it('mantém o aviso pendente após falha e não retorna sozinho ao assistente', () => {
    expect(transitionHandoff('WAITING_NOTIFICATION', 'NOTIFICATION_FAILED')).toEqual({
      state: 'WAITING_NOTIFICATION', assistantMayReply: false, notificationRequired: true,
    });
    expect(transitionHandoff('HUMAN', 'NOTIFICATION_FAILED').assistantMayReply).toBe(false);
    expect(transitionHandoff('HUMAN', 'HUMAN_RELEASED').assistantMayReply).toBe(true);
  });

  it('não retrocede ao receber aviso ou pedido duplicado durante atendimento', () => {
    for (const state of ['WAITING_HUMAN', 'HUMAN'] as HandoffState[]) {
      expect(transitionHandoff(state, 'REQUEST_HUMAN').state).toBe(state);
      expect(transitionHandoff(state, 'NOTIFICATION_SENT').state).toBe(state);
    }
    expect(transitionHandoff('ASSISTANT', 'NOTIFICATION_SENT').state).toBe('ASSISTANT');
  });

  it('permite que a equipe assuma antes da confirmação do aviso', () => {
    expect(transitionHandoff('WAITING_NOTIFICATION', 'HUMAN_ASSUMED')).toEqual({
      state: 'HUMAN', assistantMayReply: false, notificationRequired: false,
    });
  });
});
