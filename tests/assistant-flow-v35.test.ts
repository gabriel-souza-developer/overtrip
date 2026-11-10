import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Node = { name: string; type: string; parameters: Record<string, unknown>; credentials?: Record<string, { id?: string; name: string }>; alwaysOutputData?: boolean };

// O fluxo real só existe na máquina do operador (docs/local/, fora do git: endereços internos e IDs da conta).
const IMPORT = 'docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json';
const REAL_V34 = 'docs/local/OVERTRIP Assistente WhatsApp v34.json';
const CHANGED = ['Agrupa trips do site', 'Consulta base de conhecimento', 'Consulta trips do site'];

describe('repositório sem fluxos n8n', () => {
  it('não versiona exportações do n8n em docs/ (só em docs/local/, ignorada pelo git)', () => {
    expect(readdirSync('docs').filter((f) => /Assistente WhatsApp.*\.json$/.test(f))).toEqual([]);
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^docs\/local\/$/m);
  });
});

describe.skipIf(!existsSync(REAL_V34))('fluxo v35 pronto para importar no n8n', () => {
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

  it('é gerado de forma reproduzível a partir da v34 real', () => {
    execFileSync('python3', ['-I', 'scripts/build-assistant-v35.py']);
    const first = readFileSync(IMPORT, 'utf8');
    execFileSync('python3', ['-I', 'scripts/build-assistant-v35.py']);
    expect(readFileSync(IMPORT, 'utf8')).toBe(first);
  });

  it('está completo: sem marcadores, com nome da v35 e desligado até a troca', () => {
    const text = readFileSync(IMPORT, 'utf8');
    expect(text).not.toMatch(/__[A-Z_]+__/);
    expect(text).not.toContain('overtrip.com.br/trips.json');
    expect(text).not.toContain('overtrip.com.br/knowledge.json');
    const flow = JSON.parse(text);
    expect(flow.name).toBe('OVERTRIP Assistente WhatsApp v35');
    expect(flow.active).toBe(false);
  });

  it('busca viagens e base no serviço privado pela tailnet, com a credencial do n8n', () => {
    const nodes = Object.fromEntries((read(IMPORT).nodes as Node[]).map((n) => [n.name, n]));
    for (const [name, route] of [['Consulta trips do site', '/n8n/v2/trips'], ['Consulta base de conhecimento', '/n8n/v2/knowledge']]) {
      expect(String(nodes[name].parameters.url)).toMatch(new RegExp(`^https://[a-z0-9-]+\\.tail[0-9a-f]+\\.ts\\.net:8443${route}$`));
      expect(nodes[name].parameters.authentication).toBe('genericCredentialType');
      expect(nodes[name].credentials?.httpHeaderAuth.name).toBe('OVERTRIP Serviço Privado');
    }
    expect(nodes['Consulta trips do site'].alwaysOutputData).toBe(true);
    expect(String(nodes['Agrupa trips do site'].parameters.jsCode)).toContain('trip.title');
  });

  it('mantém da v34 real o webhook, as conexões, as URLs e as credenciais dos demais nós', () => {
    const v35 = read(IMPORT); const v34 = read(REAL_V34);
    expect(v35.connections).toEqual(v34.connections);
    expect(v35.nodes.length).toBe(v34.nodes.length);
    const byName = Object.fromEntries((v35.nodes as Node[]).map((n) => [n.name, n]));
    const changed = (v34.nodes as Node[]).filter((n) => JSON.stringify(n) !== JSON.stringify(byName[n.name])).map((n) => n.name).sort();
    expect(changed).toEqual(CHANGED);
  });
});
