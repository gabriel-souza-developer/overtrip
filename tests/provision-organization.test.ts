import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { provisionOrganization } from '../scripts/lib/provisionOrganization';

const directory = mkdtempSync(join(tmpdir(), 'overtrip-provision-'));
const path = join(directory, 'test.db');
const url = `file:${path}`;
const db = new PrismaClient({ datasources: { db: { url } } });
const input = { organizationId: 'agency-a', organizationName: 'Agência A', slug: 'agencia-a', email: 'owner@example.test', userName: 'Operador' };
const password = 'senha-de-teste-123';
const invoke = (args: string[], secret = '') => spawnSync(resolve('node_modules/.bin/tsx'), ['scripts/provision-organization.ts', ...args], { encoding: 'utf8', input: secret });
const args = ['--database', url, '--organization-id', input.organizationId, '--organization-name', input.organizationName, '--slug', input.slug, '--email', input.email, '--user-name', input.userName];

beforeAll(() => { execFileSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' }); }, 30000);
beforeEach(async () => {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS provision_fail');
  await db.membership.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe('provisionamento de empresa', () => {
  it('simula sem gravações e cria conta isolada apenas ao aplicar', async () => {
    expect(await provisionOrganization(db, input, undefined)).toBe('simulation');
    expect(await db.organization.count()).toBe(0);
    expect(await provisionOrganization(db, input, password, true)).toBe('applied');
    const user = await db.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.legacyAccess).toBe(false); expect(user.role).toBe('editor');
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect(await db.membership.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({ organizationId: input.organizationId, role: 'OWNER', status: 'ACTIVE' });
  });

  it('recusa e-mail existente sem mudar senha, permissões ou vínculos, inclusive diferenças de caixa', async () => {
    const existing = await db.user.create({ data: { email: 'OWNER@example.test', passwordHash: 'existing', legacyAccess: true, role: 'admin' } });
    await expect(provisionOrganization(db, input, password, true)).rejects.toThrow('Já existe');
    expect(await db.user.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing);
    expect(await db.membership.count()).toBe(0); expect(await db.organization.count()).toBe(0);
  });

  it('recusa IDs e slugs duplicados, sem criar usuário', async () => {
    await db.organization.create({ data: { id: input.organizationId, name: 'Outra', slug: 'outra' } });
    await expect(provisionOrganization(db, input, password, true)).rejects.toThrow('já utilizado');
    await expect(provisionOrganization(db, { ...input, organizationId: 'different', slug: 'outra' }, password, true)).rejects.toThrow('já utilizado');
    expect(await db.user.count()).toBe(0);
  });

  it('reverte empresa e conta se criação do vínculo falhar', async () => {
    await db.$executeRawUnsafe(`CREATE TRIGGER provision_fail BEFORE INSERT ON "Membership" BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);
    await expect(provisionOrganization(db, input, password, true)).rejects.toThrow();
    expect(await db.organization.count()).toBe(0); expect(await db.user.count()).toBe(0); expect(await db.membership.count()).toBe(0);
  });

  it('valida dados e a senha antes de gravar', async () => {
    await expect(provisionOrganization(db, { ...input, slug: '../invalido' }, password, true)).rejects.toThrow('inválidos');
    await expect(provisionOrganization(db, input, 'curta', true)).rejects.toThrow('Senha inválida');
    await expect(provisionOrganization(db, input, 'á'.repeat(40), true)).rejects.toThrow('Senha inválida');
    expect(await db.user.count()).toBe(0);
  });

  it('CLI exige banco existente, senha via stdin, e não escreve segredos ou dados pessoais em saída', () => {
    const simulation = invoke(args);
    expect(simulation.status).toBe(0); expect(simulation.stdout).toContain('Simulação');
    const applied = invoke([...args, '--apply'], `${password}\n`);
    expect(applied.status).toBe(0);
    expect(applied.stdout + applied.stderr).not.toContain(password);
    expect(applied.stdout + applied.stderr).not.toContain(input.email);
    expect(invoke([...args, '--password', password]).status).not.toBe(0);
    expect(invoke(['--database', 'file:/tmp/nao-existe-provision.db', ...args.slice(2)]).status).not.toBe(0);
    const fake = join(directory, 'not-sqlite'); writeFileSync(fake, 'not a database');
    expect(invoke(['--database', `file:${fake}`, ...args.slice(2)]).status).not.toBe(0);
  }, 30000);
});
