'use strict';
const assert = require('node:assert/strict');
const { evaluate } = require('./monitor-engine.js');
const { selectWahaSession } = require('./n8n/select-waha-session.js');

function metrics({ cpu = 20, mem = 50, disk = 50, elapsedSec = 120, idleSec } = {}) {
  const total = elapsedSec;
  const idle = idleSec ?? total * (1 - cpu / 100);
  return [
    `node_cpu_seconds_total{cpu="0",mode="idle"} ${idle}`,
    `node_cpu_seconds_total{cpu="0",mode="user"} ${total - idle}`,
    'node_memory_MemTotal_bytes 10000000000',
    `node_memory_MemAvailable_bytes ${100000000 * mem}`,
    'node_filesystem_size_bytes{mountpoint="/",fstype="ext4"} 100000000000',
    `node_filesystem_avail_bytes{mountpoint="/",fstype="ext4"} ${1000000000 * disk}`,
  ].join('\n');
}
const samples = text => ({ debian: { statusCode: 200, body: text }, oracle: { statusCode: 200, body: text } });
const run = (state, at, text) => evaluate(samples(text), state, new Date(at));
const t0 = Date.parse('2026-11-28T12:00:00Z');

let state = {};
assert.equal(run(state, t0, metrics()).length, 0);

// CPU critical must persist for five minutes.
state = {};
run(state, t0, metrics());
for (let i = 1; i <= 5; i++) assert.equal(run(state, t0 + i * 60000, metrics({ cpu: 99, elapsedSec: 120 + i * 60, idleSec: 96 + i * 0.6 })).length, 0);
const cpuAlert = run(state, t0 + 6 * 60000, metrics({ cpu: 99, elapsedSec: 480, idleSec: 99.6 }));
assert(cpuAlert.some(a => a.metric.startsWith('CPU crítico') && a.severity === 'CRÍTICO'));

// Low memory and disk are debounced for five minutes.
state = {};
run(state, t0, metrics());
for (let i = 1; i <= 5; i++) run(state, t0 + i * 60000, metrics({ mem: 5, disk: 4 }));
const resourceAlerts = run(state, t0 + 6 * 60000, metrics({ mem: 5, disk: 4 }));
assert(resourceAlerts.some(a => a.metric.startsWith('Memória')));
assert(resourceAlerts.some(a => a.metric.startsWith('Disco')));

// Host outage is deduplicated; recovery arrives once after two successful scrapes.
state = {};
const fail = { debian: { error: 'timeout' }, oracle: { statusCode: 200, body: metrics() } };
for (let i = 0; i < 3; i++) evaluate(fail, state, new Date(t0 + i * 60000));
const down = evaluate(fail, state, new Date(t0 + 3 * 60000));
assert.equal(down.filter(a => a.metric === 'Disponibilidade').length, 1);
assert.equal(evaluate(fail, state, new Date(t0 + 4 * 60000)).filter(a => a.metric === 'Disponibilidade').length, 0);
const ok = samples(metrics());
evaluate(ok, state, new Date(t0 + 5 * 60000));
const recovered = evaluate(ok, state, new Date(t0 + 6 * 60000));
assert.equal(recovered.filter(a => a.metric === 'Disponibilidade' && a.state === 'RECUPERADO').length, 1);

// Warning escalates to critical without a false warning-recovery notice.
state = {};
run(state, t0, metrics({ elapsedSec: 120 }));
for (let i = 1; i <= 11; i++) run(state, t0 + i * 60000, metrics({ cpu: 90, elapsedSec: 120 + i * 60, idleSec: 96 + i * 6 }));
assert(state.hosts['Debian homelab'].incidents['CPU alta ≥85% por 10 min'].active);
let escalation = [];
for (let i = 12; i <= 17; i++) escalation = run(state, t0 + i * 60000, metrics({ cpu: 99, elapsedSec: 120 + i * 60, idleSec: 162 + (i - 11) * 0.6 }));
assert(escalation.some(a => a.metric.startsWith('CPU crítico')));
assert(!escalation.some(a => a.state === 'RECUPERADO' && a.metric.startsWith('CPU alta')));
assert.equal(state.hosts['Debian homelab'].incidents['CPU alta ≥85% por 10 min'].active, false);

// Exact NOX session is selected by name; there is no fallback to another working session.
assert.equal(selectWahaSession([{ name: 'overtrip-test', status: 'WORKING' }, { name: 'nox', status: 'WORKING' }]), 'nox');
assert.throws(() => selectWahaSession([{ name: 'overtrip-test', status: 'WORKING' }]), /nox/);
assert.throws(() => selectWahaSession([{ name: 'nox', status: 'STOPPED' }, { name: 'overtrip-test', status: 'WORKING' }]), /nox/);
assert.throws(() => selectWahaSession([{ name: 'nox', status: 'WORKING' }, { name: 'nox', status: 'WORKING' }]), /nox/);

console.log('OK: limites, recuperação e seleção estrita da sessão nox sem fallback.');
