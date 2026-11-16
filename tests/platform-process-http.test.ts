import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';

describe('processo isolado da plataforma', () => {
  it('usa banco próprio, autentica e não expõe rotas de turismo', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'overtrip-platform-process-'));
    const url = `file:${join(directory, 'platform.db')}`;
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    let processHandle: ReturnType<typeof spawn> | undefined;
    try {
      const migration = spawnSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
      expect(migration.status, migration.stderr).toBe(0);
      const operator = await prisma.user.create({ data: { email: 'process@example.test', passwordHash: await bcrypt.hash('senha-ficticia-123', 4), role: 'user' } });
      const org = await prisma.organization.create({ data: { name: 'Pousada teste', slug: 'pousada-processo', niche: 'pousada' } });
      await prisma.membership.create({ data: { userId: operator.id, organizationId: org.id, role: 'owner' } });
      const port = await new Promise<number>((resolvePort, reject) => {
        const socket = createServer();
        socket.once('error', reject);
        socket.listen(0, '127.0.0.1', () => {
          const address = socket.address();
          const value = typeof address === 'object' && address ? address.port : 0;
          socket.close(() => resolvePort(value));
        });
      });
      const base = `http://127.0.0.1:${port}`;
      processHandle = spawn(process.execPath, ['--import', 'tsx', resolve('src/platformIndex.ts')], {
        env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PLATFORM_PORT: String(port), DATABASE_URL: `file:${join(directory, 'legacy.db')}`, JWT_SECRET: 'segredo-turismo-ficticio', PLATFORM_DATABASE_URL: url, PLATFORM_JWT_SECRET: 'segredo-plataforma-ficticio' },
        stdio: 'ignore',
      });
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        if (processHandle.exitCode !== null) throw new Error('O processo da plataforma terminou antes de ficar pronto.');
        try { ready = (await fetch(`${base}/health`)).ok; } catch { /* starting */ }
        if (ready) break;
        await new Promise(done => setTimeout(done, 100));
      }
      expect(ready).toBe(true);
      const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'process@example.test', password: 'senha-ficticia-123' }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
      const organizations = await fetch(`${base}/api/organizations`, { headers: { Cookie: cookie } });
      expect(organizations.status).toBe(200);
      expect((await organizations.json() as { organizations: { id: string }[] }).organizations.map(item => item.id)).toEqual([org.id]);
      expect((await fetch(`${base}/api/trips`, { headers: { Cookie: cookie } })).status).toBe(404);
    } finally {
      if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
        const exited = new Promise<void>(done => processHandle!.once('exit', () => done()));
        processHandle.kill('SIGTERM');
        const timeout = setTimeout(() => processHandle!.kill('SIGKILL'), 3000);
        await exited;
        clearTimeout(timeout);
      }
      await prisma.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
