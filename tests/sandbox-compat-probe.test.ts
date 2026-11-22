import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSyntheticPdfFixture, runExtractionProbe } from '../scripts/lib/sandboxCompatProbe';

// Cobre a metade pura/testável de scripts/check-sandbox-compat.sh (a sonda
// que exercita a cadeia real de extração + geração de variantes contra um
// PDF sintético — ver scripts/lib/sandboxCompatProbe.ts). A metade que
// envolve systemd-run/bwrap em unidades transitórias do próprio sistema
// não é reproduzida aqui por CI (mesmo motivo de
// tests/pdf-embedded-images.test.ts: exige sandbox real do SO, não um
// mock) — é verificada manualmente, rodando o script, documentado em
// docs/SANDBOX_COMPAT_CHECK.md.

const sandboxAvailable = existsSync('/usr/bin/pdfimages') && existsSync('/usr/bin/prlimit') && existsSync('/usr/bin/bwrap') && existsSync('/usr/bin/systemd-run');
const realSandbox = { bwrapPath: '/usr/bin/bwrap', limiterPath: '/usr/bin/prlimit', systemdRunPath: '/usr/bin/systemd-run', pdfimagesPath: '/usr/bin/pdfimages', timeoutMs: 15_000 };

describe('fixture sintética do verificador de compatibilidade', () => {
  it('monta um PDF válido, pequeno, nunca lido de disco nem de dados reais', async () => {
    const { pdf, width, height } = await buildSyntheticPdfFixture();
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    // Pequena de propósito: a sonda deve ser rápida mesmo dentro de uma
    // unidade transitória com overhead próprio de systemd-run/bwrap.
    expect(pdf.length).toBeLessThan(50_000);
  });

  it('cada chamada gera bytes novos, nunca reaproveita um buffer entre execuções', async () => {
    const first = await buildSyntheticPdfFixture();
    const second = await buildSyntheticPdfFixture();
    expect(first.pdf).not.toBe(second.pdf);
    expect(Buffer.compare(first.pdf, second.pdf)).toBe(0);
  });
});

describe('runExtractionProbe — relatório fail-closed', () => {
  it.skipIf(!sandboxAvailable)('sandbox real disponível: a cadeia real completa (extração + 3 variantes) com sucesso', async () => {
    const result = await runExtractionProbe(realSandbox);
    expect(result).toMatchObject({ ok: true, stage: 'done', candidates: 1, variants: 3 });
  });

  it('bwrap ausente é reportado como SANDBOX_UNAVAILABLE no estágio "extract", nunca um sucesso disfarçado', async () => {
    const result = await runExtractionProbe({ ...realSandbox, bwrapPath: '/nao-existe/bwrap' });
    expect(result).toMatchObject({ ok: false, stage: 'extract', code: 'SANDBOX_UNAVAILABLE' });
  });

  it('prlimit ausente também é SANDBOX_UNAVAILABLE no estágio "extract"', async () => {
    const result = await runExtractionProbe({ ...realSandbox, limiterPath: '/nao-existe/prlimit' });
    expect(result).toMatchObject({ ok: false, stage: 'extract', code: 'SANDBOX_UNAVAILABLE' });
  });

  it('parser (pdfimages) ausente é PARSER_UNAVAILABLE, distinto de um problema de sandbox', async () => {
    const result = await runExtractionProbe({ ...realSandbox, pdfimagesPath: '/nao-existe/pdfimages' });
    expect(result).toMatchObject({ ok: false, stage: 'extract', code: 'PARSER_UNAVAILABLE' });
  });

  it.skipIf(!sandboxAvailable)('systemd-run ausente é MEMORY_ISOLATION_UNAVAILABLE: extractEmbeddedImages já exige o cgroup antes de decodificar a primeira imagem, então aparece no estágio "extract"', async () => {
    const result = await runExtractionProbe({ ...realSandbox, systemdRunPath: '/nao-existe/systemd-run' });
    expect(result).toMatchObject({ ok: false, stage: 'extract', code: 'MEMORY_ISOLATION_UNAVAILABLE' });
  });

  it('nunca lança: qualquer falha vira um ProbeResult com ok:false, para o script shell sempre ter uma linha de JSON para ler', async () => {
    await expect(runExtractionProbe({ ...realSandbox, bwrapPath: '/nao-existe/bwrap' })).resolves.toMatchObject({ ok: false });
  });
});
