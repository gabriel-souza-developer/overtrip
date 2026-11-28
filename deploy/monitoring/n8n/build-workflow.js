'use strict';
const fs = require('node:fs');
const path = require('node:path');
const engine = fs.readFileSync(path.join(__dirname, '..', 'monitor-engine.js'), 'utf8');
const engineCode = engine.replace(/\nif \(typeof module !== 'undefined'\)[\s\S]*$/, '');
const sessionSelector = fs.readFileSync(path.join(__dirname, 'select-waha-session.js'), 'utf8')
  .replace(/\nif \(typeof module !== 'undefined'\)[\s\S]*$/, '');

const teamChatId = '__OVERTRIP_INTERNAL_TEAM_GROUP_ID__';
const credentialId = '__WAHA_HTTP_HEADER_CREDENTIAL_ID__';
const nodes = [
  {
    id: 'monitor-schedule', name: 'A cada minuto', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
    position: [0, 0], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 * * * * *' }] } },
  },
  {
    id: 'monitor-debian', name: 'Coleta Debian', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5,
    position: [220, -100], onError: 'continueRegularOutput',
    parameters: { url: 'http://100.111.0.47:9100/metrics', options: { timeout: 8000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } } } },
  },
  {
    id: 'monitor-oracle', name: 'Coleta Oracle', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5,
    position: [440, -100], onError: 'continueRegularOutput',
    parameters: { url: 'http://100.99.26.96:9100/metrics', options: { timeout: 8000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } } } },
  },
  {
    id: 'monitor-evaluate', name: 'Avalia limites', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [660, -100], parameters: { mode: 'runOnceForAllItems', jsCode: `${engineCode}\nconst state = $getWorkflowStaticData('global');\nconst samples = { debian: $('Coleta Debian').first().json, oracle: $('Coleta Oracle').first().json };\nreturn evaluate(samples, state, new Date()).map(alert => ({ json: alert }));` },
  },
  {
    id: 'monitor-group', name: 'Agrupa avisos', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [880, -100], parameters: { mode: 'runOnceForAllItems', jsCode: `const rows = $input.all().map(item => item.json);\nif (!rows.length) return [];\nreturn [{ json: { chatId: '${teamChatId}', text: rows.map(row => row.text).join('\\n\\n') } }];` },
  },
  {
    id: 'monitor-waha-sessions', name: 'Consulta sessão do Nox', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5,
    position: [1100, -100], onError: 'continueRegularOutput',
    parameters: { url: 'http://192.168.18.150:3100/api/sessions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 10000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } },
    credentials: { httpHeaderAuth: { id: credentialId, name: 'WAHA API Key Session' } },
  },
  {
    id: 'monitor-prepare-send', name: 'Prepara envio interno', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1320, -100], parameters: { mode: 'runOnceForAllItems', jsCode: `${sessionSelector}\nconst response = $input.first()?.json || {};\nconst body = response.body;\nconst sessions = Array.isArray(body) ? body : Array.isArray(body?.sessions) ? body.sessions : [];\nconst selectedSession = selectWahaSession(sessions, 'nox');\nconst notice = $('Agrupa avisos').first().json;\nreturn [{ json: { session: selectedSession, chatId: notice.chatId, text: notice.text } }];` },
  },
  {
    id: 'monitor-send-waha', name: 'Envia alerta ao grupo interno', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5,
    position: [1540, -100],
    parameters: {
      method: 'POST', url: 'http://192.168.18.150:3100/api/sendText', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, bodyParameters: { parameters: [
        { name: 'session', value: '={{ $json.session }}' },
        { name: 'chatId', value: '={{ $json.chatId }}' },
        { name: 'text', value: '={{ $json.text }}' },
      ] }, options: { timeout: 20000 },
    }, credentials: { httpHeaderAuth: { id: credentialId, name: 'WAHA API Key Session' } },
  },
];
const connections = {
  'A cada minuto': { main: [[{ node: 'Coleta Debian', type: 'main', index: 0 }]] },
  'Coleta Debian': { main: [[{ node: 'Coleta Oracle', type: 'main', index: 0 }]] },
  'Coleta Oracle': { main: [[{ node: 'Avalia limites', type: 'main', index: 0 }]] },
  'Avalia limites': { main: [[{ node: 'Agrupa avisos', type: 'main', index: 0 }]] },
  'Agrupa avisos': { main: [[{ node: 'Consulta sessão do Nox', type: 'main', index: 0 }]] },
  'Consulta sessão do Nox': { main: [[{ node: 'Prepara envio interno', type: 'main', index: 0 }]] },
  'Prepara envio interno': { main: [[{ node: 'Envia alerta ao grupo interno', type: 'main', index: 0 }]] },
};
const workflow = {
  name: 'NOX Monitor de hosts Debian e vm-oracle',
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveExecutionProgress: false, saveManualExecutions: false },
  staticData: null,
};
process.stdout.write(JSON.stringify(workflow, null, 2) + '\n');
