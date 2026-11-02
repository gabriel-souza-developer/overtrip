import { describe, expect, it } from 'vitest';
import { authenticateAssistantService } from '../src/services/assistantServiceAuth.js';

describe('credencial interna do conector', () => {
  it('falha fechada e só aceita credencial própria bem formatada', () => {
    const secret = 'ab'.repeat(32);
    expect(authenticateAssistantService(undefined, `Bearer ${secret}`)).toBe(false);
    expect(authenticateAssistantService('fraco', 'Bearer fraco')).toBe(false);
    expect(authenticateAssistantService(secret, undefined)).toBe(false);
    expect(authenticateAssistantService(secret, `Bearer ${'cd'.repeat(32)}`)).toBe(false);
    expect(authenticateAssistantService(secret, `Bearer ${secret}, Bearer ${secret}`)).toBe(false);
    expect(authenticateAssistantService(secret, `Bearer ${secret}`)).toBe(true);
  });
});
