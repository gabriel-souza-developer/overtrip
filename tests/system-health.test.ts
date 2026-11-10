import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readSystemHealth } from '../src/services/systemHealth.js';

const dir = mkdtempSync(join(tmpdir(), 'overtrip-health-'));
const file = join(dir, 'status.json');
const NOW = new Date('2026-11-10T12:00:00Z');
const write = (value: unknown, checkedAt = '2026-11-10T11:58:00Z') =>
  writeFileSync(file, JSON.stringify({ checkedAt, ok: true, checks: [{ status: 'ok', message: 'caddy.service ativo' }], ...(value as object) }));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('leitura do status de saúde', () => {
  it('informa indisponível quando o monitor ainda não gerou o arquivo', async () => {
    expect((await readSystemHealth(join(dir, 'ausente.json'), NOW)).state).toBe('unavailable');
  });

  it('retorna ok com as verificações e a idade do resultado', async () => {
    write({});
    const health = await readSystemHealth(file, NOW);
    expect(health).toMatchObject({ state: 'ok', ageMinutes: 2, checks: [{ status: 'ok', message: 'caddy.service ativo' }] });
  });

  it('retorna alerta quando alguma verificação falhou', async () => {
    write({ ok: false, checks: [{ status: 'alert', message: 'caddy.service inativo' }] });
    expect((await readSystemHealth(file, NOW)).state).toBe('alert');
  });

  it('marca como desatualizado quando o monitor parou há mais de 15 minutos', async () => {
    write({}, '2026-11-10T11:30:00Z');
    expect((await readSystemHealth(file, NOW)).state).toBe('stale');
  });

  it('recusa conteúdo inválido sem repassar o arquivo', async () => {
    writeFileSync(file, JSON.stringify({ checkedAt: 'x', ok: true, checks: [{ status: 'ok', message: '<script>' }], extra: 'segredo' }));
    const health = await readSystemHealth(file, NOW);
    expect(health.state).toBe('unavailable');
    expect(JSON.stringify(health)).not.toContain('segredo');
  });

  it('recusa arquivos grandes demais', async () => {
    writeFileSync(file, 'x'.repeat(70_000));
    expect((await readSystemHealth(file, NOW)).state).toBe('unavailable');
  });
});

describe('script do monitor', () => {
  it('grava um status.json válido mesmo quando encerra antes do fim', () => {
    const out = join(dir, 'script.json');
    try {
      execFileSync('bash', ['deploy/monitor-health.sh'], { env: { ...process.env, HEALTH_STATUS_FILE: out }, stdio: 'pipe', timeout: 60_000 });
    } catch { /* fora da VM as verificações falham; só o arquivo importa aqui */ }
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(typeof parsed.ok).toBe('boolean');
    expect(Number.isNaN(Date.parse(parsed.checkedAt))).toBe(false);
    expect(parsed.checks.length).toBeGreaterThan(0);
    for (const check of parsed.checks) expect(['ok', 'alert', 'metric']).toContain(check.status);
    return readSystemHealth(out).then((health) => expect(health.state).not.toBe('unavailable'));
  });
});

describe('rota /api/system/health', () => {
  let server: Server;
  let base: string;
  let adminToken: string;
  let editorToken: string;
  let ids: string[] = [];

  beforeAll(async () => {
    process.env.HEALTH_STATUS_FILE = file;
    const { default: app } = await import('../src/app.js');
    const { prisma } = await import('../src/lib/prisma.js');
    const { generateToken } = await import('../src/middleware/auth.js');
    const tag = `health-${Date.now()}`;
    const admin = await prisma.user.create({ data: { email: `${tag}-a@example.test`, passwordHash: 'x', role: 'admin' } });
    const editor = await prisma.user.create({ data: { email: `${tag}-e@example.test`, passwordHash: 'x', role: 'editor' } });
    ids = [admin.id, editor.id];
    adminToken = generateToken(admin);
    editorToken = generateToken(editor);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/system/health`;
  });

  afterAll(async () => {
    const { prisma } = await import('../src/lib/prisma.js');
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('exige login de administrador', async () => {
    expect((await fetch(base)).status).toBe(401);
    expect((await fetch(base, { headers: { Authorization: `Bearer ${editorToken}` } })).status).toBe(403);
  });

  it('entrega o status ao administrador sem cache', async () => {
    write({}, new Date().toISOString());
    const now = new Date();
    utimesSync(file, now, now);
    const response = await fetch(base, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).state).toBe('ok');
  });
});
