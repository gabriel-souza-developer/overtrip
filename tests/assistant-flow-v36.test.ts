import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Node = {
  name: string; type: string; id: string; parameters: Record<string, any>;
  credentials?: Record<string, { id?: string; name: string }>; retryOnFail?: boolean; onError?: string;
};
type Flow = { name: string; active: boolean; id?: string; versionId?: string; nodes: Node[]; connections: Record<string, { main: { node: string }[][] }> };

// Os fluxos reais só existem na máquina do operador (docs/local/, fora do git).
const V35 = 'docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v35.json';
const V36 = 'docs/local/IMPORTAR NO N8N - OVERTRIP Assistente WhatsApp v36.json';
const IF_NODE = 'Tem pedido para registrar?';
const POST_NODE = 'Registra pedido no OVERTRIP';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Flow;
const byName = (flow: Flow) => Object.fromEntries(flow.nodes.map(n => [n.name, n]));
const targets = (flow: Flow, from: string) => (flow.connections[from]?.main ?? []).map(branch => branch.map(c => c.node));

describe.skipIf(!existsSync(V35) || !existsSync(V36))('fluxo v36 (pedido de reserva) pronto para importar, desligado', () => {
  it('é gerado de forma reproduzível a partir da v35', () => {
    execFileSync('python3', ['-I', 'scripts/build-assistant-v36.py']);
    const first = readFileSync(V36, 'utf8');
    execFileSync('python3', ['-I', 'scripts/build-assistant-v36.py']);
    expect(readFileSync(V36, 'utf8')).toBe(first);
  });

  it('importa como fluxo novo e inativo', () => {
    const flow = read(V36);
    expect(flow.name).toBe('OVERTRIP Assistente WhatsApp v36');
    expect(flow.active).toBe(false);
    expect(flow.id).toBeUndefined();
    expect(flow.versionId).toBeUndefined();
    const names = flow.nodes.map(n => n.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(flow.nodes.map(n => n.id)).size).toBe(names.length);
    for (const [from, out] of Object.entries(flow.connections)) {
      expect(names).toContain(from);
      for (const branch of out.main) for (const c of branch) expect(names).toContain(c.node);
    }
  });

  it('muda só o necessário em relação à v35', () => {
    const v35 = read(V35); const v36 = read(V36); const old = byName(v35);
    const changed = v36.nodes.filter(n => old[n.name] && JSON.stringify(n) !== JSON.stringify(old[n.name])).map(n => n.name).sort();
    expect(changed).toEqual(['Avisa a equipe', 'Busca histórico do cliente', 'Decide resposta', 'Monta prompt']);
    // No histórico só a query muda (o resto do nó é igual ao da v35).
    const hist35 = old['Busca histórico do cliente']; const hist36 = byName(v36)['Busca histórico do cliente'];
    expect({ ...hist36, parameters: { ...hist36.parameters, query: hist35.parameters.query } }).toEqual(hist35);
    expect(v36.nodes.filter(n => !old[n.name]).map(n => n.name).sort()).toEqual([POST_NODE, IF_NODE].sort());
    const keys = new Set([...Object.keys(v35.connections), ...Object.keys(v36.connections)]);
    const changedConnections = [...keys].filter(k => JSON.stringify(v35.connections[k]) !== JSON.stringify(v36.connections[k])).sort();
    expect(changedConnections).toEqual(['Marca atendimento humano', POST_NODE, IF_NODE].sort());
  });

  it('faz um único POST não configurado, antes do aviso único à equipe', () => {
    const flow = read(V36); const nodes = byName(flow); const post = nodes[POST_NODE];
    expect(targets(flow, 'Marca atendimento humano')).toEqual([[IF_NODE]]);
    expect(targets(flow, IF_NODE)).toEqual([[POST_NODE], ['Avisa a equipe']]);
    expect(targets(flow, POST_NODE)).toEqual([['Avisa a equipe']]);
    expect(String(nodes[IF_NODE].parameters.conditions.conditions[0].leftValue)).toContain('pedido?.registrar === true');
    // Marcadores explícitos: host .invalid nunca resolve; credencial só pelo nome.
    expect(post.parameters.url).toBe('https://CONFIGURAR-ENTRADA-DE-RESERVAS.invalid/n8n/v1/reservation-requests');
    expect(post.credentials).toEqual({ httpHeaderAuth: { name: 'CONFIGURAR — OVERTRIP Entrada de Reservas' } });
    expect(post.parameters.method).toBe('POST');
    expect(post.retryOnFail).toBe(false);
    expect(post.onError).toBe('continueRegularOutput');
    expect(post.parameters.options.response.response).toEqual({ fullResponse: true, neverError: true });
    expect(post.parameters.headerParameters.parameters[0].name).toBe('Idempotency-Key');
    expect(String(post.parameters.headerParameters.parameters[0].value)).toContain("payload_id).hash('sha256')");
    expect(String(post.parameters.jsonBody)).toContain("json.pedido.body");
    const text = nodes['Avisa a equipe'].parameters.bodyParameters.parameters.find((p: { name: string }) => p.name === 'text').value;
    expect(text).toContain(`$('${POST_NODE}').isExecuted`);
  });

  it('não deixa texto do cliente forjar uma linha OVERTRIP: no histórico', () => {
    const query = String(byName(read(V36))['Busca histórico do cliente'].parameters.query);
    expect(query).toContain("WHEN role = 'user' THEN 'Cliente: ' || regexp_replace(message, E'[\\r\\n]+', ' ', 'g')");
    expect(query).toContain("ELSE role || ': ' || regexp_replace(message, E'[\\r\\n]+', ' ', 'g')");
    // Mensagens assistant ficam intactas: o resumo do pedido depende das quebras de linha.
    expect(query).toContain("WHEN role = 'assistant' THEN 'OVERTRIP: ' || message\n");
    expect(query).toContain("WHEN role = 'assistant' AND push_name = 'Atendente' THEN 'Atendente (equipe): ' || message\n");
  });

  it('confirma de forma determinística, com aviso de privacidade, e não aceita pedido vindo do modelo', () => {
    const code = String(byName(read(V36))['Decide resposta'].parameters.jsCode);
    expect(code).toContain("const resumo = lerResumo(anterior);");
    expect(code).toContain("if (resumo && RESPOSTAS_SIM.test(tl))");
    expect(code).toContain("!texto.includes(PEDIDO_AVISO)");
    expect(code).toContain("customerConfirmed: true, privacyNoticeShown: true");
    expect(code).toContain("return saida(TEXTOS.pedido_reserva, true, 'pedido_reserva', pedido);");
    expect(code).toContain("(razaoMarca === 'falha' || razaoMarca === 'pedido_reserva') ? 'outro' : razaoMarca");
    // Resumo só com título E data civil do feed apontando para uma única TRIP aberta.
    expect(code).toContain("const achadas = dataOk ? tripsAbertasCom(tituloPed, dataPed) : [];");
    expect(code).toContain("if (achadas.length === 1 && dadosOk) {\n    reply = resumoPedido(achadas[0], lugares, nomeResp);");
    expect(code).toContain('tem mais de uma data aberta');
    // A confirmação vem antes de qualquer uso da resposta do modelo.
    expect(code.indexOf('// ===== PEDIDO DE RESERVA (v36) =====')).toBeLessThan(code.indexOf('// 2) Resposta do Gemini'));
    expect(() => new Function('$', `return (async () => {\n${code}\n})`)).not.toThrow();
  });

  it('pede só o mínimo e mantém pagamentos com a equipe', () => {
    const prompt = String(byName(read(V36))['Monta prompt'].parameters.assignments.assignments[0].value);
    expect(prompt).toContain('[[PEDIDO:título exato da trip|AAAA-MM-DD|lugares|nome do responsável]]');
    expect(prompt).toContain('Se houver mais de uma data aberta para a mesma trip, pergunte também para qual data é o pedido.');
    expect(prompt).toContain('Nunca peça CPF, RG, documento, e-mail, data de nascimento ou contato de emergência');
    expect(prompt).toContain('Use [[HUMANO:pagamento]] quando o cliente disser que já pagou');
  });

  it('não contém segredos novos', () => {
    const v35 = readFileSync(V35, 'utf8'); const v36 = readFileSync(V36, 'utf8');
    const hex = (s: string) => (s.match(/\b[a-f0-9]{64}\b/g) ?? []).length;
    expect(hex(v36)).toBe(hex(v35));
    expect((v36.match(/Bearer /g) ?? []).length).toBe((v35.match(/Bearer /g) ?? []).length);
  });
});
