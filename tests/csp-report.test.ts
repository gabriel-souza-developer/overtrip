import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import cspReportRoutes from '../src/routes/cspReportRoutes.js';

let server: Server;
let endpoint: string;

beforeAll(async () => {
  const app = express();
  app.use('/api/csp-report', cspReportRoutes);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/csp-report`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('recepção de relatórios CSP', () => {
  it('mantém a política em modo de observação e aponta para o coletor interno', () => {
    const policy = readFileSync('deploy/CSP-REPORT-ONLY.caddy', 'utf8');
    expect(policy).toContain('Content-Security-Policy-Report-Only');
    expect(policy).toContain('report-uri /api/csp-report');
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain('unsafe-inline');
  });

  it('aceita o formato legado e remove query strings do log', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report' },
        body: JSON.stringify({ 'csp-report': {
          'document-uri': 'https://overtrip.com.br/?session=secreto',
          'blocked-uri': 'https://cdn.example.test/script.js?token=secreto',
          'effective-directive': 'script-src-elem',
          'source-file': 'https://overtrip.com.br/js/main.js?cache=1',
          'line-number': 42,
        } }),
      });
      expect(response.status).toBe(204);
      expect(log).toHaveBeenCalledOnce();
      const logged = String(log.mock.calls[0][1]);
      expect(logged).toContain('https://cdn.example.test/script.js');
      expect(logged).not.toContain('secreto');
      expect(logged).not.toContain('cache=1');
    } finally {
      log.mockRestore();
    }
  });

  it('aceita Reporting API, limita arrays e rejeita JSON malformado', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const modern = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/reports+json' },
        body: JSON.stringify([{ type: 'csp-violation', body: { blockedURL: 'inline', effectiveDirective: 'style-src-attr' } }]),
      });
      expect(modern.status).toBe(204);
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }

    const invalid = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: '{',
    });
    expect(invalid.status).toBe(400);
  });
});
