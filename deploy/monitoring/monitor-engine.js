'use strict';

const HOSTS = {
  debian: { label: 'Debian homelab' },
  oracle: { label: 'vm-oracle' },
};
const COOLDOWN_MS = 60 * 60 * 1000;
const SAMPLE_GAP_MS = 2 * 60 * 1000;

function parsePrometheus(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)/);
    if (!m) continue;
    const labels = {};
    if (m[2]) {
      for (const pair of m[2].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g)) {
        labels[pair[1]] = pair[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }
    const value = Number(m[3]);
    if (Number.isFinite(value)) rows.push({ name: m[1], labels, value });
  }
  return rows;
}

function getSample(input) {
  if (!input || input.error) return { ok: false, reason: 'falha de conexão' };
  const status = Number(input.statusCode ?? input.status ?? 200);
  const body = input.body ?? input.metrics ?? input.data ?? '';
  if (status < 200 || status >= 300 || typeof body !== 'string' || !body.includes('node_')) {
    return { ok: false, reason: status ? `HTTP ${status}` : 'resposta inválida' };
  }
  return { ok: true, rows: parsePrometheus(body) };
}

function metric(rows, name, predicate = () => true) {
  return rows.filter(r => r.name === name && predicate(r.labels));
}

function formatLocal(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
  }).format(date);
}

function duration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days) return `${days}d ${hrs % 24}h`;
  if (hrs) return `${hrs}h ${mins % 60}min`;
  return `${mins}min`;
}

function evaluate(samples, state, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  state.hosts ||= {};
  const messages = [];

  function emit(host, key, incident, status, severity, value, impact, action) {
    const firstAt = new Date(incident.startedAt).getTime();
    const stateName = status === 'RECUPERADO' ? 'RECUPERADO' : 'ATIVO';
    const stamp = new Date(nowMs);
    messages.push({
      host,
      severity,
      state: stateName,
      metric: key,
      value,
      startedAt: new Date(firstAt).toISOString(),
      duration: duration(nowMs - firstAt),
      impact,
      action,
      text: [
        `*${severity} · ${stateName}*`,
        `Host: ${host}`,
        `Métrica: ${key} — ${value}`,
        `Início: ${formatLocal(new Date(firstAt))} (São Paulo)`,
        `Duração: ${duration(nowMs - firstAt)}`,
        `Impacto: ${impact}`,
        `Ação: ${action}`,
        `Atualizado: ${formatLocal(stamp)} (São Paulo) · ${stamp.toISOString()}`,
      ].join('\n'),
    });
  }

  function incident(host, key, condition, recoverCondition, waitMs, severity, value, impact, action) {
    const incidents = state.hosts[host].incidents ||= {};
    const x = incidents[key] ||= { since: null, active: false, lastSent: 0, recoveryCount: 0 };
    if (condition) {
      x.recoveryCount = 0;
      if (!x.active) {
        if (x.since == null || nowMs - x.lastSeen > SAMPLE_GAP_MS) x.since = nowMs;
        x.lastSeen = nowMs;
        if (nowMs - x.since >= waitMs) {
          x.active = true;
          x.firstStartedAt = x.since;
          x.lastSent = nowMs;
          emit(host, key, { startedAt: x.firstStartedAt }, 'ATIVO', severity, value, impact, action);
        }
      } else {
        x.lastSeen = nowMs;
        if (nowMs - x.lastSent >= COOLDOWN_MS) {
          x.lastSent = nowMs;
          emit(host, key, { startedAt: x.firstStartedAt }, 'ATIVO', severity, value, impact, action);
        }
      }
    } else {
      if (x.active && recoverCondition) {
        x.recoveryCount += 1;
        if (x.recoveryCount >= 2) {
          emit(host, key, { startedAt: x.firstStartedAt ?? nowMs }, 'RECUPERADO', severity, value, impact, 'Acompanhar por mais uma coleta.');
          x.active = false;
          x.recoveryCount = 0;
          x.since = null;
          x.lastSeen = null;
          x.firstStartedAt = null;
        }
      } else if (x.active) {
        x.recoveryCount = 0;
      } else {
        x.since = null;
        x.lastSeen = null;
      }
    }
  }

  for (const [id, meta] of Object.entries(HOSTS)) {
    const host = state.hosts[id] ||= { failures: 0, downSince: null, downActive: false, lastSuccess: null, cpu: null, incidents: {} };
    state.hosts[meta.label] = host;
    const sample = getSample(samples[id]);
    if (!sample.ok) {
      host.failures += 1;
      host.cpu = null;
      host.lastSuccess ??= null;
      host.downSince ??= nowMs;
      if (!host.downActive && host.failures >= 3 && nowMs - host.downSince >= 180000) {
        host.downActive = true;
        host.downStartedAt = host.downSince;
        host.downSentAt = nowMs;
        emit(meta.label, 'Disponibilidade', { startedAt: host.downSince }, 'ATIVO', 'CRÍTICO', sample.reason, 'Sem métricas do host; monitoramento local interrompido.', 'Verificar conectividade Tailscale, host e serviço node_exporter.');
      } else if (host.downActive && nowMs - host.downSentAt >= COOLDOWN_MS) {
        host.downSentAt = nowMs;
        emit(meta.label, 'Disponibilidade', { startedAt: host.downSince }, 'ATIVO', 'CRÍTICO', sample.reason, 'Sem métricas do host; monitoramento local interrompido.', 'Verificar conectividade Tailscale, host e serviço node_exporter.');
      }
      continue;
    }

    const wasDown = host.downActive;
    host.failures = 0;
    host.downSince = null;
    host.lastSuccess = nowMs;
    if (wasDown) {
      host.recoveryCount = (host.recoveryCount || 0) + 1;
      if (host.recoveryCount >= 2) {
        emit(meta.label, 'Disponibilidade', { startedAt: host.downStartedAt || nowMs }, 'RECUPERADO', 'CRÍTICO', 'endpoint respondendo', 'Coleta de métricas restabelecida.', 'Acompanhar a próxima coleta.');
        host.downActive = false;
        host.recoveryCount = 0;
        host.downStartedAt = null;
      }
    } else host.recoveryCount = 0;
    if (host.downActive) continue;

    const cpuRows = metric(sample.rows, 'node_cpu_seconds_total');
    const cpuTotal = cpuRows.reduce((sum, r) => sum + r.value, 0);
    const cpuIdle = cpuRows.filter(r => r.labels.mode === 'idle').reduce((sum, r) => sum + r.value, 0);
    let cpuPct = null;
    if (host.cpu && cpuTotal > host.cpu.total && nowMs - host.cpu.at <= SAMPLE_GAP_MS) {
      const dt = cpuTotal - host.cpu.total;
      const di = cpuIdle - host.cpu.idle;
      if (dt > 0 && di >= 0) cpuPct = Math.max(0, Math.min(100, 100 * (1 - di / dt)));
    }
    host.cpu = { total: cpuTotal, idle: cpuIdle, at: nowMs };
    if (cpuPct != null) {
      const warning = host.incidents['CPU alta ≥85% por 10 min'];
      if (cpuPct >= 95 && warning?.active) {
        warning.active = false;
        warning.since = null;
        warning.lastSeen = null;
        warning.firstStartedAt = null;
        warning.recoveryCount = 0;
      }
      incident(meta.label, 'CPU crítico ≥95% por 5 min', cpuPct >= 95, cpuPct < 90, 300000, 'CRÍTICO', `${cpuPct.toFixed(1)}%`, 'CPU sustentada em faixa crítica.', 'Verificar processos ativos e reduzir carga desnecessária.');
      incident(meta.label, 'CPU alta ≥85% por 10 min', cpuPct >= 85 && cpuPct < 95, cpuPct < 80, 600000, 'AVISO', `${cpuPct.toFixed(1)}%`, 'CPU sustentada acima do limite de atenção.', 'Verificar processos ativos e acompanhar tendência.');
    }

    const memTotal = metric(sample.rows, 'node_memory_MemTotal_bytes')[0]?.value;
    const memAvail = metric(sample.rows, 'node_memory_MemAvailable_bytes')[0]?.value;
    if (memTotal > 0 && Number.isFinite(memAvail)) {
      const memPct = 100 * memAvail / memTotal;
      incident(meta.label, 'Memória disponível <10% por 5 min', memPct < 10, memPct >= 12, 300000, 'AVISO', `${memPct.toFixed(1)}% disponível`, 'Pouca memória disponível pode reduzir a resposta dos serviços.', 'Verificar consumo de memória e serviços em execução.');
    }

    const roots = metric(sample.rows, 'node_filesystem_avail_bytes', l => l.mountpoint === '/' && !/tmpfs|overlay/.test(l.fstype || ''));
    const sizes = metric(sample.rows, 'node_filesystem_size_bytes', l => l.mountpoint === '/' && !/tmpfs|overlay/.test(l.fstype || ''));
    const diskAvail = roots[0]?.value;
    const diskSize = sizes[0]?.value;
    if (diskSize > 0 && Number.isFinite(diskAvail)) {
      const freePct = 100 * diskAvail / diskSize;
      const freeGb = diskAvail / 1e9;
      const low = freePct < 15 || freeGb < 5;
      const recovered = freePct > 18 && freeGb > 8;
      incident(meta.label, 'Disco livre <15% ou <5 GB por 5 min', low, recovered, 300000, 'AVISO', `${freePct.toFixed(1)}% · ${freeGb.toFixed(1)} GB livres`, 'Pouco espaço pode impedir gravações e atualizações.', 'Liberar arquivos temporários e revisar crescimento dos dados.');
    }
  }
  return messages;
}

if (typeof module !== 'undefined') module.exports = { evaluate, parsePrometheus, getSample };
