import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Records every real execFile call (file + args) the module makes, while
// still delegating to the real implementation — same pattern as
// tests/organization-trip-document-images-http.test.ts. Used by exactly
// one test below to inspect the actual bwrap invocation used for the
// png/export phase: a deterministic, non-flaky structural check that no
// writable --bind ever reappears there (a dynamic adversarial-parser test
// alone cannot prove this, because the module's own cleanup removes any
// evidence of a successful escape before the call returns, in both the
// vulnerable and the fixed version alike).
const recordedExecFileCalls: { file: string; args: string[] }[] = [];
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: (file: string, args: string[], options: unknown, callback: unknown) => {
    recordedExecFileCalls.push({ file, args });
    return actual.execFile(file, args, options as object, callback as never);
  } };
});

import { decodeCandidateSandboxed, processPdfCandidateSandboxed, extractEmbeddedImages, PdfImagesError } from '../src/services/pdfEmbeddedImages';

// This module requires real OS-level sandboxing (bwrap + prlimit +
// systemd-run, the last one for the decode step's cgroup memory cap), never
// a mocked stand-in: every test below either runs the real sandbox or
// asserts the fail-closed behaviour when a piece of it is deliberately broken.
const sandboxAvailable = existsSync('/usr/bin/pdfimages') && existsSync('/usr/bin/prlimit') && existsSync('/usr/bin/bwrap') && existsSync('/usr/bin/systemd-run');
const decodeSandbox = { bwrapPath: '/usr/bin/bwrap', limiterPath: '/usr/bin/prlimit', systemdRunPath: '/usr/bin/systemd-run', timeoutMs: 8_000 };

// A minimal synthetic PDF, assembled in memory; no user documents or database.
function pdfWithJpeg(jpeg: Buffer, width: number, height: number): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let size = chunks[0].length;
  const add = (value: Buffer | string) => { const part = Buffer.isBuffer(value) ? value : Buffer.from(value); chunks.push(part); size += part.length; };
  const object = (index: number, content: Buffer | string) => { offsets[index] = size; add(`${index} 0 obj\n`); add(content); add('\nendobj\n'); };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  object(4, Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]));
  const content = 'q 250 0 0 250 20 20 cm /Im0 Do Q';
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = size;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

// Scans the HOST's own /proc (never inside any sandbox's private pid
// namespace, which trivially shows nothing once it is torn down) for any
// process whose cmdline contains `marker`. Used to prove, from outside,
// that a descendant the decode sandbox forked does not leak onto the real
// host — the namespace it was created in disappearing is not evidence of
// that by itself.
async function hostHasProcessWithMarker(marker: string): Promise<boolean> {
  const entries = await readdir('/proc').catch(() => [] as string[]);
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmdline = await readFile(`/proc/${entry}/cmdline`);
      if (cmdline.includes(marker)) return true;
    } catch { /* process already gone mid-scan: not a match either way */ }
  }
  return false;
}

function killByMarker(marker: string): void {
  execFile('/usr/bin/pkill', ['-9', '-f', marker], () => {});
}

describe('extração privada de imagens de PDF', () => {
  it.skipIf(!sandboxAvailable)('não expõe segredos ou variáveis de carregamento ao parser', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pdf-env-parser-'));
    const parser = path.join(dir, 'parser.sh');
    const previous = { jwt: process.env.JWT_SECRET, node: process.env.NODE_OPTIONS, preload: process.env.LD_PRELOAD };
    try {
      await writeFile(parser, '#!/bin/sh\n[ -z "$JWT_SECRET" ] && [ -z "$NODE_OPTIONS" ] && [ -z "$LD_PRELOAD" ] || exit 71\nprintf "header\\nseparator\\n"\n');
      await chmod(parser, 0o755);
      process.env.JWT_SECRET = 'private-canary-never-forward';
      process.env.NODE_OPTIONS = '--require=/untrusted-canary';
      process.env.LD_PRELOAD = '/untrusted-canary.so';
      await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), parser)).resolves.toEqual([]);
    } finally {
      for (const [key, value] of Object.entries({ JWT_SECRET: previous.jwt, NODE_OPTIONS: previous.node, LD_PRELOAD: previous.preload })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.skipIf(!sandboxAvailable)('não expõe arquivos vizinhos do parser configurado mesmo quando legíveis no host', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pdf-parser-neighbor-'));
    const parser = path.join(dir, 'parser.sh');
    const secret = path.join(dir, 'canary.txt');
    try {
      // O diretório e o arquivo são legíveis para qualquer usuário no host:
      // a ausência no sandbox deve resultar do isolamento, não de chmod 700.
      await chmod(dir, 0o755);
      await writeFile(secret, 'private-neighbor-canary', { mode: 0o644 });
      await writeFile(parser, `#!/bin/sh\n[ ! -r '${secret}' ] || exit 71\nprintf 'header\\nseparator\\n'\n`, { mode: 0o755 });
      await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), parser)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.skipIf(!sandboxAvailable)('extrai uma imagem de PDF sintético pela sandbox real e entrega JPEG sem publicar', async () => {
    const jpeg = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#3e7199' } }).jpeg().toBuffer();
    const result = await extractEmbeddedImages(pdfWithJpeg(jpeg, 100, 80), '/usr/bin/pdfimages');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ page: 1, width: 100, height: 80, mimeType: 'image/jpeg' });
    expect((await sharp(result[0].data).metadata()).format).toBe('jpeg');
  });

  it('rejeita dados que não sejam PDF e parser indisponível', async () => {
    await expect(extractEmbeddedImages(Buffer.from('arquivo'), '/usr/bin/pdfimages')).rejects.toMatchObject({ code: 'INVALID_PDF' });
    await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4'), '/nao-existe/pdfimages')).rejects.toMatchObject({ code: 'PARSER_UNAVAILABLE' });
    await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4'), 'pdfimages')).rejects.toBeInstanceOf(PdfImagesError);
  });

  it('nunca executa o parser sem sandbox: bwrap ou prlimit ausentes falham fechado com SANDBOX_UNAVAILABLE, nunca um fallback inseguro', async () => {
    // /usr/bin/true (coreutils) só para existir e passar a checagem do
    // próprio parser — o que este teste prova não depende de pdfimages
    // estar instalado, por isso não entra no skipIf(!sandboxAvailable).
    await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4'), '/usr/bin/true', { bwrapPath: '/nao-existe/bwrap' }))
      .rejects.toMatchObject({ code: 'SANDBOX_UNAVAILABLE' });
    await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4'), '/usr/bin/true', { limiterPath: '/nao-existe/prlimit' }))
      .rejects.toMatchObject({ code: 'SANDBOX_UNAVAILABLE' });
  });

  it('nunca decodifica sem isolamento real de memória: systemd-run ausente falha fechado com MEMORY_ISOLATION_UNAVAILABLE, nunca um limite mais fraco apresentado como equivalente', async () => {
    // prlimit --as por si só não serve de cota real de memória para o
    // processo de decodificação (V8 precisa de GiBs de espaço de endereço
    // virtual só para iniciar, e RLIMIT_RSS não é imposto por este kernel —
    // verificado manualmente). Por isso o isolamento de memória depende de
    // systemd-run + cgroup, e sua ausência deve desativar a decodificação
    // por completo, nunca cair para um limite mais fraco silenciosamente.
    await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4'), '/usr/bin/true', { systemdRunPath: '/nao-existe/systemd-run' }))
      .rejects.toMatchObject({ code: 'MEMORY_ISOLATION_UNAVAILABLE' });
  });

  it.skipIf(!sandboxAvailable)('falha de forma segura em PDF corrompido e dimensões excessivas', async () => {
    await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\ncorrompido'), '/usr/bin/pdfimages')).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ddd' } }).jpeg().toBuffer();
    await expect(extractEmbeddedImages(pdfWithJpeg(jpeg, 5000, 5000), '/usr/bin/pdfimages')).rejects.toMatchObject({ code: 'IMAGE_LIMIT' });
  });

  it.skipIf(!sandboxAvailable)('a cota agregada de disco é imposta pelo próprio kernel DURANTE a extração, não só conferida depois — e falha fechado (nada é devolvido)', async () => {
    // Uma imagem grande o bastante para, ao ser reescrita em PNG, passar
    // claramente de um tmpfs de alguns KB — mas ainda dentro dos limites
    // normais (pixels, dimensão) que as checagens do Node fariam passar.
    // Isto prova que o tmpfs dimensionado (SANDBOX_TMPFS_BYTES, aqui
    // reduzido via override só para o teste) é um limite real, imposto
    // pelo kernel enquanto o parser ainda está escrevendo — não uma soma
    // feita só depois que o processo já terminou (é exatamente a lacuna
    // que a revisão anterior apontou). Verificado manualmente antes deste
    // teste com `dd`/dentro de `bwrap --size`: escrever além do tamanho
    // falha com ENOSPC ainda dentro do processo sandboxado.
    const jpeg = await sharp({
      create: { width: 1800, height: 1800, channels: 3, background: { r: 100, g: 150, b: 200 } },
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    }).jpeg({ quality: 100 }).toBuffer();
    await expect(extractEmbeddedImages(pdfWithJpeg(jpeg, 1800, 1800), '/usr/bin/pdfimages', { tmpfsBytes: 8192 }))
      .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
  });

  it.skipIf(!sandboxAvailable)('tempo total (relógio) é limitado e mata todo o processo sandboxado, mesmo que o parser esteja preso', async () => {
    // Um "parser" que nunca retorna por conta própria: prova que o timeout
    // (e não a cooperação do parser) é quem encerra a extração, e que o
    // processo sandboxado (bwrap, com seu próprio reaper em PID 1 por
    // --unshare-all) morre de verdade com o SIGKILL do timeout, em vez de
    // ficar pendurado até o timeout padrão de 15s do módulo.
    const dir = await mkdtemp(path.join(tmpdir(), 'pdf-images-slow-parser-'));
    const slowParser = path.join(dir, 'slow-pdfimages.sh');
    await writeFile(slowParser, '#!/bin/sh\nsleep 30\n');
    await chmod(slowParser, 0o755);
    const start = Date.now();
    await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), slowParser, { timeoutMs: 300 }))
      .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it.skipIf(!sandboxAvailable)('limita extrações simultâneas (nunca enfileira): a partir do limite, rejeita na hora com CONCURRENCY_LIMIT', async () => {
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer();
    const pdf = pdfWithJpeg(jpeg, 10, 10);
    // Três chamadas disparadas sem aguardar nenhuma: cada uma reserva sua
    // vaga de forma síncrona, antes do primeiro await — por isso a ordem
    // de quem ganha a vaga e quem é recusado é determinística aqui, não
    // uma corrida. O módulo permite, hoje, até 2 extrações simultâneas.
    const results = await Promise.allSettled([
      extractEmbeddedImages(pdf, '/usr/bin/pdfimages'),
      extractEmbeddedImages(pdf, '/usr/bin/pdfimages'),
      extractEmbeddedImages(pdf, '/usr/bin/pdfimages'),
    ]);
    const limited = results.filter(r => r.status === 'rejected' && (r.reason as PdfImagesError).code === 'CONCURRENCY_LIMIT');
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(limited).toHaveLength(1);
    expect(succeeded).toHaveLength(2);
  });

  it.skipIf(!sandboxAvailable)('parser adversarial: tentar escrever fora de /work (inclusive num diretório real do host, como /output usava ser) e encher a cota não escapa nem corrompe a extração — falha fechado', async () => {
    // Um "parser" hostil que, em vez de converter a imagem de verdade,
    // tenta (a) escrever num diretório REAL e gravável do host — o mesmo
    // papel que /output tinha antes do ajuste: um bind real, só que agora
    // nenhum existe para ele alcançar — e (b) encher a cota com uma
    // escrita bruta (dd), não uma imagem legítima grande demais (já
    // coberto pelo teste de cota acima). scriptDir (onde este próprio
    // script mora) não é montado por sandboxArgs(parserPath) — ele
    // PRECISA disso só para ser executável — mas escapeDir é um diretório
    // totalmente separado, nunca bind de propósito algum: exatamente a
    // situação que um parser comprometido enfrentaria hoje.
    const scriptDir = await mkdtemp(path.join(tmpdir(), 'pdf-images-adversarial-'));
    const escapeDir = await mkdtemp(path.join(tmpdir(), 'pdf-images-escape-target-'));
    const adversarialParser = path.join(scriptDir, 'adversarial-pdfimages.sh');
    const escapeMarker = path.join(escapeDir, 'evil.png');
    await writeFile(adversarialParser, [
      '#!/bin/sh',
      'case "$*" in',
      '  *-list*)',
      "    printf 'header\\nheader\\n   1     0 image      10    10\\n'",
      '    ;;',
      '  *-png*)',
      `    echo evil > ${escapeMarker} 2>/dev/null`,
      '    mkdir -p /output 2>/dev/null; echo evil > /output/evil.png 2>/dev/null',
      '    echo evil > /escaped.png 2>/dev/null',
      '    dd if=/dev/zero of=/work/flood.bin bs=1M count=200 2>/dev/null',
      '    ;;',
      'esac',
    ].join('\n'));
    await chmod(adversarialParser, 0o755);

    try {
      // Nunca produz um /work/image-000.png legítimo (nem a escrita bruta
      // nem a tentativa de escape geram um): falha fechado de todo jeito,
      // nunca devolve dados parciais ou corrompidos.
      await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), adversarialParser, { tmpfsBytes: 1_048_576 }))
        .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
      // Nada escapou para um caminho absoluto real e conhecido de
      // antemão pelo processo adversarial. Isto por si só não isola a
      // falha de /output especificamente (a limpeza do diretório por
      // chamada remove qualquer vestígio de qualquer forma, antes ou
      // depois do ajuste) — o teste estrutural abaixo, que inspeciona os
      // argumentos reais passados ao bwrap, é a prova direta de que
      // nenhum --bind gravável existe na chamada da fase de PNG.
      expect(existsSync(escapeMarker)).toBe(false);
    } finally {
      await rm(scriptDir, { recursive: true, force: true });
      await rm(escapeDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!sandboxAvailable)('a chamada real da fase de PNG nunca inclui um --bind gravável: o único destino de escrita é --tmpfs /work, nunca um diretório real do host', async () => {
    // Prova direta e determinística (não depende do comportamento de um
    // parser, nem de inspecionar o disco depois que a limpeza por chamada
    // já rodou) de que o achado está corrigido: inspeciona os argumentos
    // de verdade passados ao bwrap real nesta chamada. --ro-bind (/usr, o
    // diretório do parser, e o input.pdf só leitura) é esperado; --bind
    // (gravável) nunca pode aparecer aqui — era exatamente essa a flag
    // (`--bind outDir /output`) que a revisão encontrou.
    recordedExecFileCalls.length = 0;
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer();
    await extractEmbeddedImages(pdfWithJpeg(jpeg, 10, 10), '/usr/bin/pdfimages');
    const pngPhaseCall = recordedExecFileCalls.find(call => call.file === '/usr/bin/bwrap' && call.args.includes('--tmpfs'));
    expect(pngPhaseCall).toBeDefined();
    expect(pngPhaseCall!.args).not.toContain('--bind');
    expect(pngPhaseCall!.args).toContain('--ro-bind');
  });

  it.skipIf(!sandboxAvailable)('processo filho que sobrevive ao parser e tenta substituir a imagem: ganha a corrida (bytes rejeitados por decodificação/tamanho) ou falha fechado — nunca devolve a imagem substituída como se fosse a original', async () => {
    // O parser produz a imagem legítima e, antes de sair, deixa um
    // processo em segundo plano tentando trocá-la repetidamente por uma
    // OUTRA imagem válida, de dimensões diferentes — exatamente o processo
    // filho adversarial que a revisão apontou. A defesa (fase de reap +
    // conferência de largura/altura contra a fase -list, anterior e
    // separada) não prova ausência total de corrida a nível de instrução,
    // mas garante que o resultado nunca é a imagem substituída aceita como
    // se fosse a original: ou o original é lido, ou a leitura pega bytes
    // truncados/da imagem errada e a decodificação rejeita.
    const scriptDir = await mkdtemp(path.join(tmpdir(), 'pdf-images-orphan-'));
    try {
      const legitPng = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
      const evilPng = await sharp({ create: { width: 77, height: 77, channels: 3, background: '#fff' } }).png().toBuffer();
      const adversarialParser = path.join(scriptDir, 'orphan-pdfimages.sh');
      await writeFile(adversarialParser, [
        '#!/bin/sh',
        'case "$*" in',
        '  *-list*)',
        "    printf 'header\\nheader\\n   1     0 image      10    10\\n'",
        '    ;;',
        '  *-png*)',
        `    printf %s ${legitPng.toString('base64')} | base64 -d > /work/image-000.png`,
        `    ( while :; do printf %s ${evilPng.toString('base64')} | base64 -d > /work/image-000.png 2>/dev/null; done ) &`,
        '    ;;',
        'esac',
      ].join('\n'));
      await chmod(adversarialParser, 0o755);

      for (let trial = 0; trial < 5; trial += 1) {
        try {
          const result = await extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), adversarialParser);
          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({ width: 10, height: 10 });
        } catch (error) {
          expect(error).toMatchObject({ code: 'EXTRACTION_FAILED' });
        }
      }
    } finally {
      await rm(scriptDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!sandboxAvailable)('um symlink no nome esperado da exportação é rejeitado — nunca lido como se fosse a imagem', async () => {
    const scriptDir = await mkdtemp(path.join(tmpdir(), 'pdf-images-symlink-'));
    try {
      const adversarialParser = path.join(scriptDir, 'symlink-pdfimages.sh');
      await writeFile(adversarialParser, [
        '#!/bin/sh',
        'case "$*" in',
        '  *-list*)',
        "    printf 'header\\nheader\\n   1     0 image      10    10\\n'",
        '    ;;',
        '  *-png*)',
        '    ln -s /input.pdf /work/image-000.png',
        '    ;;',
        'esac',
      ].join('\n'));
      await chmod(adversarialParser, 0o755);
      await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), adversarialParser))
        .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    } finally {
      await rm(scriptDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!sandboxAvailable)('bytes corrompidos (não é uma imagem de verdade) no nome esperado falham fechado na decodificação, nunca são aceitos', async () => {
    const scriptDir = await mkdtemp(path.join(tmpdir(), 'pdf-images-corrupt-'));
    try {
      const adversarialParser = path.join(scriptDir, 'corrupt-pdfimages.sh');
      await writeFile(adversarialParser, [
        '#!/bin/sh',
        'case "$*" in',
        '  *-list*)',
        "    printf 'header\\nheader\\n   1     0 image      10    10\\n'",
        '    ;;',
        '  *-png*)',
        "    printf 'nao-e-uma-imagem-de-verdade' > /work/image-000.png",
        '    ;;',
        'esac',
      ].join('\n'));
      await chmod(adversarialParser, 0o755);
      await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), adversarialParser))
        .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    } finally {
      await rm(scriptDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!sandboxAvailable)('parser que mente sobre as dimensões (lista pequeno, exporta uma bomba de descompressão) é rejeitado rapidamente, sem decodificar de verdade', async () => {
    // -list declara 10x10 (passa os limites de pixel sem problema), mas o
    // arquivo exportado de fato é um PNG real de 3000x3000 (9M pixels,
    // acima de MAX_PIXELS_PER_IMAGE) — um cor sólida comprime para poucos
    // bytes, a forma clássica de uma bomba de descompressão. limitInputPixels
    // do sharp rejeita isso a partir do cabeçalho, sem decodificar os
    // pixels de verdade (por isso o teste também mede o tempo: uma bomba
    // real decodificada por completo não terminaria em milissegundos).
    const scriptDir = await mkdtemp(path.join(tmpdir(), 'pdf-images-bomb-'));
    try {
      const bombPng = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
      const adversarialParser = path.join(scriptDir, 'bomb-pdfimages.sh');
      await writeFile(adversarialParser, [
        '#!/bin/sh',
        'case "$*" in',
        '  *-list*)',
        "    printf 'header\\nheader\\n   1     0 image      10    10\\n'",
        '    ;;',
        '  *-png*)',
        `    printf %s ${bombPng.toString('base64')} | base64 -d > /work/image-000.png`,
        '    ;;',
        'esac',
      ].join('\n'));
      await chmod(adversarialParser, 0o755);
      const start = Date.now();
      await expect(extractEmbeddedImages(Buffer.from('%PDF-1.4\nfixture'), adversarialParser))
        .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
      expect(Date.now() - start).toBeLessThan(5000);
    } finally {
      await rm(scriptDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!sandboxAvailable)('a pasta temporária é sempre removida, no sucesso e na falha — nenhum resíduo fica em tmpdir()', async () => {
    const before = new Set((await readdir(tmpdir())).filter(name => name.startsWith('overtrip-pdf-images-')));
    const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#111' } }).jpeg().toBuffer();
    await extractEmbeddedImages(pdfWithJpeg(jpeg, 20, 20), '/usr/bin/pdfimages');
    await extractEmbeddedImages(Buffer.from('%PDF-1.4\ncorrompido'), '/usr/bin/pdfimages').catch(() => {});
    const after = new Set((await readdir(tmpdir())).filter(name => name.startsWith('overtrip-pdf-images-')));
    expect(after).toEqual(before);
  });
});

describe('decodeCandidateSandboxed (decodificação isolada por bwrap/prlimit/systemd-run, fora deste processo)', () => {
  it.skipIf(!sandboxAvailable)('não expõe segredos ao decodificador e funciona sem escrever no diretório da aplicação', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pdf-env-decoder-'));
    const driver = path.join(dir, 'driver.cjs');
    const oldSecret = process.env.JWT_SECRET;
    try {
      await writeFile(driver, "if (process.env.JWT_SECRET || process.env.NODE_OPTIONS || process.env.LD_PRELOAD) process.exit(71); process.stdout.write('1 1 1\\nX');");
      process.env.JWT_SECRET = 'private-canary-never-forward';
      await expect(decodeCandidateSandboxed(Buffer.from('x'), 1, 1, { ...decodeSandbox, driverPath: driver }))
        .resolves.toMatchObject({ width: 1, height: 1, data: Buffer.from('X') });
      recordedExecFileCalls.length = 0;
      const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
      await decodeCandidateSandboxed(png, 10, 10, decodeSandbox);
      const decode = recordedExecFileCalls.find(call => call.file === decodeSandbox.systemdRunPath && call.args.includes(decodeSandbox.bwrapPath));
      const runtimeDriver = decode?.args.find(arg => /overtrip-pdf-decode-.*\/driver\.cjs$/.test(arg));
      expect(runtimeDriver).toBeTruthy();
      expect(runtimeDriver!.startsWith(tmpdir() + path.sep)).toBe(true);
      expect(existsSync(runtimeDriver!)).toBe(false);
    } finally {
      if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.skipIf(!sandboxAvailable)('rejeita quando a imagem de verdade não bate com as dimensões esperadas (parser mentiroso sobre metadados)', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    await expect(decodeCandidateSandboxed(png, 99, 99, decodeSandbox)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
  });

  it.skipIf(!sandboxAvailable)('rejeita um PNG malicioso (bomba de descompressão: cabeçalho declara 9M pixels) rapidamente, sem decodificar de verdade', async () => {
    // Cor sólida comprime para poucos KB mas declara 3000x3000 (9M pixels,
    // acima de MAX_PIXELS_PER_IMAGE): limitInputPixels do sharp rejeita a
    // partir do cabeçalho, antes de alocar os pixels de verdade — por isso
    // a medição de tempo: uma bomba real decodificada por completo não
    // terminaria em milissegundos.
    const bomb = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    const start = Date.now();
    await expect(decodeCandidateSandboxed(bomb, 3000, 3000, decodeSandbox)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it.skipIf(!sandboxAvailable)('rejeita bytes que não são uma imagem de verdade', async () => {
    await expect(decodeCandidateSandboxed(Buffer.from('nao-e-uma-imagem-de-verdade'), 10, 10, decodeSandbox)).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
  });

  it.skipIf(!sandboxAvailable)('limite agregado de saída: falha fechado quando a saída reconvertida passaria do limite configurado — nunca devolve dados parciais', async () => {
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 100, g: 150, b: 200 } },
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    }).png().toBuffer();
    // O driver verifica result.data.length > maxOutputBytes e sai sem
    // escrever nada (process.exit(3)) antes mesmo de o maxBuffer do
    // execFile entrar em jogo; qualquer saída não-zero do processo de
    // decodificação é classificada de forma uniforme como EXTRACTION_FAILED
    // por executeWithStdin — o importante aqui é que nada parcial volta.
    await expect(decodeCandidateSandboxed(png, 200, 200, { ...decodeSandbox, maxOutputBytes: 100 }))
      .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
  });

  it.skipIf(!sandboxAvailable)('limita decodificações simultâneas separadamente da extração (MAX_CONCURRENT_DECODES): a partir do limite, rejeita na hora com CONCURRENCY_LIMIT', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    // Três chamadas disparadas sem aguardar nenhuma: cada uma reserva sua
    // vaga de forma síncrona, antes do primeiro await — mesma lógica
    // determinística já usada no teste equivalente de extractEmbeddedImages.
    const results = await Promise.allSettled([
      decodeCandidateSandboxed(png, 10, 10, decodeSandbox),
      decodeCandidateSandboxed(png, 10, 10, decodeSandbox),
      decodeCandidateSandboxed(png, 10, 10, decodeSandbox),
    ]);
    const limited = results.filter(r => r.status === 'rejected' && (r.reason as PdfImagesError).code === 'CONCURRENCY_LIMIT');
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(limited).toHaveLength(1);
    expect(succeeded).toHaveLength(2);
  });

  it.skipIf(!sandboxAvailable)('nenhum processo descendente do decodificador sobrevive no HOST (fora de qualquer namespace) após um retorno normal', async () => {
    const marker = `decode-marker-normal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dir = await mkdtemp(path.join(tmpdir(), 'pdf-decode-orphan-normal-'));
    const driver = path.join(dir, 'driver.cjs');
    // Um decodificador "comprometido": antes de responder normalmente,
    // bifurca um processo em segundo plano, destacado (não herda nosso
    // stdout), com um marcador exclusivo — via argv0, nunca como argumento
    // real de sleep (um argumento não-numérico faria o próprio sleep
    // recusar e sair na hora, o que provaria este teste por motivo errado:
    // já verificado manualmente que `sleep 999 <marcador>` sai imediatamente
    // com erro, tornando a ausência do processo depois trivial e sem valor).
    // Responde com um framing válido (1x1, 2 bytes) e sai — simula o
    // caminho de sucesso.
    await writeFile(driver, [
      `require('child_process').spawn('/usr/bin/sleep', ['999'], { argv0: ${JSON.stringify(marker)}, stdio: 'ignore', detached: true });`,
      // process.exit(0), tal como o driver real: sem isto, o handle do
      // filho destacado mantém o laço de eventos vivo e o processo nunca
      // sairia por conta própria — não é o que um driver comprometido
      // faria (ele quer voltar "normal"), e sem a saída explícita nem
      // chega a exercitar o caminho de retorno normal de verdade.
      "process.stdout.write('1 1 2\\nOK', () => process.exit(0));",
    ].join('\n'));
    try {
      expect(await hostHasProcessWithMarker(marker)).toBe(false);
      await expect(decodeCandidateSandboxed(Buffer.from('ignorado-por-este-driver-falso'), 1, 1, { ...decodeSandbox, driverPath: driver }))
        .resolves.toMatchObject({ width: 1, height: 1 });
      expect(await hostHasProcessWithMarker(marker)).toBe(false);
    } finally {
      killByMarker(marker);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!sandboxAvailable)('nenhum processo descendente do decodificador sobrevive no HOST (fora de qualquer namespace) quando o timeout mata a árvore', async () => {
    const marker = `decode-marker-timeout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dir = await mkdtemp(path.join(tmpdir(), 'pdf-decode-orphan-timeout-'));
    const driver = path.join(dir, 'driver.cjs');
    // Mesmo processo filho destacado (via argv0, pelo mesmo motivo acima),
    // mas o decodificador nunca responde por conta própria: só o timeout
    // (SIGKILL na árvore inteira) encerra.
    await writeFile(driver, [
      `require('child_process').spawn('/usr/bin/sleep', ['999'], { argv0: ${JSON.stringify(marker)}, stdio: 'ignore', detached: true });`,
      'setInterval(() => {}, 1000);',
    ].join('\n'));
    try {
      expect(await hostHasProcessWithMarker(marker)).toBe(false);
      const start = Date.now();
      // Dispara a chamada (timeout de 1s) e, em paralelo, confere a meio
      // caminho (300ms) que o órfão está REALMENTE vivo no host nesse
      // instante — sem isto, uma ausência depois não provaria isolamento
      // nenhum: o processo poderia simplesmente nunca ter chegado a existir.
      const [, seenAliveMidFlight] = await Promise.all([
        expect(decodeCandidateSandboxed(Buffer.from('ignorado-por-este-driver-falso'), 1, 1, { ...decodeSandbox, driverPath: driver, timeoutMs: 1000 }))
          .rejects.toMatchObject({ code: 'EXTRACTION_FAILED' }),
        new Promise<boolean>((resolve) => setTimeout(() => { hostHasProcessWithMarker(marker).then(resolve); }, 300)),
      ]);
      expect(seenAliveMidFlight).toBe(true);
      expect(Date.now() - start).toBeLessThan(5000);
      expect(await hostHasProcessWithMarker(marker)).toBe(false);
    } finally {
      killByMarker(marker);
      await rm(dir, { recursive: true, force: true });
    }
  });
});


describe('variantes de mídia de PDF isoladas', () => {
  it.skipIf(!sandboxAvailable)('gera original e variantes WebP no subprocesso isolado', async () => {
    const data = await sharp({create:{width:100,height:80,channels:3,background:'#123456'}}).jpeg().toBuffer();
    const result = await processPdfCandidateSandboxed({page:1,width:100,height:80,mimeType:'image/jpeg',data});
    expect(result).toMatchObject({ext:'jpg',mimeType:'image/jpeg',width:100,height:80});
    expect((await sharp(result.main).metadata()).format).toBe('jpeg');
    expect(result.variants.map(v => v.width)).toEqual([640,960,1280]);
    for (const variant of result.variants) expect((await sharp(variant.buffer).metadata()).format).toBe('webp');
  }, 30000);
  it.skipIf(!sandboxAvailable)('redimensiona imagens largas mantendo proporção e variantes', async () => {
    const data = await sharp({create:{width:3000,height:1000,channels:3,background:'#123456'}}).jpeg().toBuffer();
    const [candidate] = await extractEmbeddedImages(pdfWithJpeg(data, 3000, 1000), '/usr/bin/pdfimages');
    const result = await processPdfCandidateSandboxed(candidate);
    expect(result).toMatchObject({width:2560,height:853});
    expect(await sharp(result.main).metadata()).toMatchObject({width:2560,height:853});
    expect(await sharp(result.variants[0].buffer).metadata()).toMatchObject({width:640,height:213});
  }, 30000);
  it.skipIf(!sandboxAvailable)('recusa bytes inválidos, dimensões mentirosas e saída acima da cota', async () => {
    const data = await sharp({create:{width:32,height:24,channels:3,background:'#fff'}}).jpeg().toBuffer();
    const candidate = {page:1,width:32,height:24,mimeType:'image/jpeg' as const,data};
    await expect(processPdfCandidateSandboxed({...candidate,data:Buffer.from('corrompido')})).rejects.toBeInstanceOf(PdfImagesError);
    await expect(processPdfCandidateSandboxed({...candidate,width:33})).rejects.toBeInstanceOf(PdfImagesError);
    await expect(processPdfCandidateSandboxed(candidate,{maxOutputBytes:128})).rejects.toBeInstanceOf(PdfImagesError);
    await expect(processPdfCandidateSandboxed(candidate,{systemdRunPath:'/nao-existe/systemd-run'})).rejects.toMatchObject({code:'MEMORY_ISOLATION_UNAVAILABLE'});
    await expect(processPdfCandidateSandboxed(candidate,{bwrapPath:'/nao-existe/bwrap'})).rejects.toBeInstanceOf(PdfImagesError);
  }, 30000);
});
