import { describe, expect, it } from 'vitest';
import { consumeSocialOAuthState, createSocialOAuthState, type OAuthStateRecord, type OAuthStateRepository } from '../src/services/socialOAuthState.js';

class MemoryStateRepository implements OAuthStateRepository {
  records = new Map<string, OAuthStateRecord>();
  async create(record: OAuthStateRecord) { this.records.set(record.stateHash, record); }
  async consume(input: { stateHash: string; userId: string; sessionVersionMs: number; now: Date }) {
    const entry = this.records.get(input.stateHash);
    if (!entry || entry.userId !== input.userId || entry.sessionVersionMs !== input.sessionVersionMs || entry.expiresAt <= input.now) return false;
    this.records.delete(input.stateHash);
    return true;
  }
}
const session = { userId: 'admin-1', sessionVersion: new Date('2026-11-16T12:00:00Z') };
const now = new Date('2026-11-16T13:00:00Z');

describe('state OAuth social', () => {
  it('gera valores aleatórios e armazena apenas hashes', async () => {
    const repo = new MemoryStateRepository();
    const first = await createSocialOAuthState(repo, session, now);
    const second = await createSocialOAuthState(repo, session, now);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...repo.records.keys()]).not.toContain(first);
    expect([...repo.records.values()][0].expiresAt.toISOString()).toBe('2026-11-16T13:10:00.000Z');
  });

  it('rejeita outra conta ou outra versão sem consumir a original', async () => {
    const repo = new MemoryStateRepository();
    const state = await createSocialOAuthState(repo, session, now);
    expect(await consumeSocialOAuthState(repo, state, { ...session, userId: 'admin-2' }, now)).toBe(false);
    expect(await consumeSocialOAuthState(repo, state, { ...session, sessionVersion: new Date(session.sessionVersion.getTime() + 1) }, now)).toBe(false);
    expect(await consumeSocialOAuthState(repo, state, session, now)).toBe(true);
    expect(await consumeSocialOAuthState(repo, state, session, now)).toBe(false);
  });

  it('expira em dez minutos e rejeita entrada inválida', async () => {
    const repo = new MemoryStateRepository();
    const state = await createSocialOAuthState(repo, session, now);
    expect(await consumeSocialOAuthState(repo, state, session, new Date(now.getTime() + 600_000))).toBe(false);
    expect(await consumeSocialOAuthState(repo, '../state', session, now)).toBe(false);
    expect(await consumeSocialOAuthState(repo, null, session, now)).toBe(false);
  });

  it('permite apenas um consumo concorrente com repositório atômico', async () => {
    const repo = new MemoryStateRepository();
    const state = await createSocialOAuthState(repo, session, now);
    const results = await Promise.all([consumeSocialOAuthState(repo, state, session, now), consumeSocialOAuthState(repo, state, session, now)]);
    expect(results.sort()).toEqual([false, true]);
  });
});
