import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import legacyApp from '../src/app.js';
import platformApp from '../src/platformApp.js';
import { prisma } from '../src/lib/prisma.js';
import { config } from '../src/config.js';

let legacy: Server;
let platform: Server;
let legacyUrl: string;
let platformUrl: string;
const email = 'cookie-isolation@example.test';
const password = 'senha-ficticia-123';

beforeAll(async () => {
  await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 4), role: 'user' } });
  await new Promise<void>(resolve => { legacy = legacyApp.listen(0, '127.0.0.1', resolve); });
  await new Promise<void>(resolve => { platform = platformApp.listen(0, '127.0.0.1', resolve); });
  legacyUrl = `http://127.0.0.1:${(legacy.address() as AddressInfo).port}/api/auth`;
  platformUrl = `http://127.0.0.1:${(platform.address() as AddressInfo).port}/api/auth`;
});

afterAll(async () => {
  if (legacy) await new Promise<void>(resolve => legacy.close(() => resolve()));
  if (platform) await new Promise<void>(resolve => platform.close(() => resolve()));
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('cookies de sessão das aplicações', () => {
  it('mantém nomes distintos e rejeita o cookie da outra aplicação', async () => {
    const login = async (url: string) => {
      const response = await fetch(`${url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      expect(response.status).toBe(200);
      return response.headers.get('set-cookie')!.split(';')[0];
    };
    const legacyCookie = await login(legacyUrl);
    const platformCookie = await login(platformUrl);
    const prefix = config.nodeEnv === 'production' ? '__Host-' : '';
    expect(legacyCookie.startsWith(`${prefix}overtrip_session=`)).toBe(true);
    expect(platformCookie.startsWith(`${prefix}overtrip_platform_session=`)).toBe(true);
    const get = (url: string, cookie: string) => fetch(`${url}/me`, { headers: { Cookie: cookie } });
    expect((await get(legacyUrl, legacyCookie)).status).toBe(200);
    expect((await get(platformUrl, platformCookie)).status).toBe(200);
    expect((await get(legacyUrl, platformCookie)).status).toBe(401);
    expect((await get(platformUrl, legacyCookie)).status).toBe(401);
    expect((await get(platformUrl, `${legacyCookie}; ${platformCookie}`)).status).toBe(200);
    expect((await get(legacyUrl, `${legacyCookie}; ${platformCookie}`)).status).toBe(200);
    const logout = await fetch(`${platformUrl}/logout`, { method: 'POST', headers: { Cookie: platformCookie, Origin: config.corsOrigin } });
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toMatch(new RegExp(`^${prefix}overtrip_platform_session=`));
  });
});
