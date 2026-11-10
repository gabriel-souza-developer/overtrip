import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Node = { name: string; type: string; parameters: Record<string, unknown>; credentials?: Record<string, { id?: string; name: string }>; alwaysOutputData?: boolean };
const path = (version: string) => `docs/OVERTRIP Assistente WhatsApp ${version} (modelo).json`;
const load = (version: string) => JSON.parse(readFileSync(path(version), 'utf8'));

describe('fluxo n8n v35 (versão do repositório)', () => {
  it('é gerado de forma reproduzível a partir da v34', () => {
    const before = readFileSync(path('v35'), 'utf8');
    execFileSync('python3', ['-I', 'scripts/build-assistant-v35.py']);
    expect(readFileSync(path('v35'), 'utf8')).toBe(before);
  });

  const v34 = load('v34');
  const v35 = load('v35');
  const nodes = Object.fromEntries((v35.nodes as Node[]).map((n) => [n.name, n]));

  it.each(['v34', 'v35'])('%s não contém dados da rede, do grupo, do webhook nem da conta n8n', (version) => {
    const text = readFileSync(path(version), 'utf8');
    expect(text).not.toMatch(/\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){1,3}\b/);
    expect(text).not.toMatch(/\.ts\.net\b/);
    expect(text).not.toMatch(/\d{12,}@g\.us/);
    expect(text).not.toMatch(/instanceId|webhookId/);
    expect(text).not.toMatch(/Bearer\s+[A-Fa-f0-9]{16,}|sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}|gsk_\w{20,}/);
    for (const node of load(version).nodes as Node[]) {
      for (const credential of Object.values(node.credentials ?? {})) expect(credential).not.toHaveProperty('id');
      if (node.type.endsWith('.webhook')) expect(node.parameters.path).toBe('__WEBHOOK_PATH__');
    }
  });

  it('não depende mais de trips.json nem knowledge.json públicos', () => {
    const text = JSON.stringify(v35);
    expect(text).not.toContain('overtrip.com.br/trips.json');
    expect(text).not.toContain('overtrip.com.br/knowledge.json');
  });

  it('busca viagens e base no serviço privado, pela tailnet e com credencial do n8n', () => {
    for (const [name, route] of [['Consulta trips do site', '/n8n/v2/trips'], ['Consulta base de conhecimento', '/n8n/v2/knowledge']]) {
      const node = nodes[name];
      expect(node.parameters.url).toBe(`https://__TAILNET_HOST__:8443${route}`);
      expect(node.parameters.authentication).toBe('genericCredentialType');
      expect(node.credentials?.httpHeaderAuth.name).toBe('OVERTRIP Serviço Privado');
    }
  });

  it('continua respondendo quando não há viagens abertas', () => {
    expect(nodes['Consulta trips do site'].alwaysOutputData).toBe(true);
    expect(String(nodes['Agrupa trips do site'].parameters.jsCode)).toContain('trip.title');
  });

  it.each(['v34', 'v35'])('o modelo %s avisa no nome que não deve ser importado', (version) => {
    expect(load(version).name).toMatch(/MODELO \(não importar\)$/);
  });

  it('importa desligado e como fluxo novo', () => {
    expect(v35.active).toBe(false);
    expect(v35).not.toHaveProperty('id');
  });

  it('preserva o restante do fluxo da v34', () => {
    expect(v35.nodes.length).toBe(v34.nodes.length);
    expect(v35.connections).toEqual(v34.connections);
    const changed = (v35.nodes as Node[]).filter((n, i) => JSON.stringify(n) !== JSON.stringify(v34.nodes[i])).map((n) => n.name);
    expect(changed.sort()).toEqual(['Agrupa trips do site', 'Consulta base de conhecimento', 'Consulta trips do site']);
  });
});

// O arquivo real só existe na máquina do operador (docs/local/, fora do git).
const IMPORT = 'docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json';
const REAL_V34 = 'docs/local/OVERTRIP Assistente WhatsApp v34.json';
describe.skipIf(!existsSync(IMPORT) || !existsSync(REAL_V34))('arquivo para importar no n8n (docs/local)', () => {
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
  it('está pronto: sem marcadores, desligado e com o nome da v35', () => {
    const text = readFileSync(IMPORT, 'utf8');
    expect(text).not.toMatch(/__[A-Z_]+__/);
    const flow = JSON.parse(text);
    expect(flow.name).toBe('OVERTRIP Assistente WhatsApp v35');
    expect(flow.active).toBe(false);
  });

  it('mantém o webhook e as credenciais da v34 real e aponta as consultas para a tailnet', () => {
    const v35real = read(IMPORT); const v34real = read(REAL_V34);
    const hook = (f: { nodes: Node[] }) => f.nodes.find((n) => n.type.endsWith('.webhook'))!;
    expect(hook(v35real).parameters.path).toBe(hook(v34real).parameters.path);
    const byName = Object.fromEntries((v35real.nodes as Node[]).map((n) => [n.name, n]));
    for (const n of v34real.nodes as Node[]) {
      if (['Consulta trips do site', 'Consulta base de conhecimento'].includes(n.name)) continue;
      expect(byName[n.name].credentials, n.name).toEqual(n.credentials);
    }
    for (const name of ['Consulta trips do site', 'Consulta base de conhecimento']) {
      expect(String(byName[name].parameters.url)).toMatch(/^https:\/\/[a-z0-9-]+\.tail[0-9a-f]+\.ts\.net:8443\/n8n\/v2\//);
    }
  });
});
