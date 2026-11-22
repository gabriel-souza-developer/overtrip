import { runExtractionProbe } from './lib/sandboxCompatProbe.js';

/**
 * CLI half of scripts/lib/sandboxCompatProbe.ts: reads sandbox binary paths
 * from the environment (never argv — this is invoked from inside a
 * systemd-run/bwrap chain built by scripts/check-sandbox-compat.sh, where
 * argv is easiest to get wrong across quoting layers) and prints EXACTLY
 * ONE line of JSON to stdout: the shell script's only contract with this
 * process. Defaults match src/services/pdfEmbeddedImages.ts's own
 * production defaults, so running this with no overrides checks the same
 * paths production would actually use.
 */
function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

async function main() {
  const result = await runExtractionProbe({
    bwrapPath: env('SANDBOX_CHECK_BWRAP_PATH', '/usr/bin/bwrap'),
    limiterPath: env('SANDBOX_CHECK_LIMITER_PATH', '/usr/bin/prlimit'),
    systemdRunPath: env('SANDBOX_CHECK_SYSTEMD_RUN_PATH', '/usr/bin/systemd-run'),
    pdfimagesPath: env('SANDBOX_CHECK_PDFIMAGES_PATH', '/usr/bin/pdfimages'),
    timeoutMs: Number(env('SANDBOX_CHECK_TIMEOUT_MS', '15000')),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

void main().catch((error: unknown) => {
  // Never let an unexpected throw escape as a stack trace mixed into
  // stdout: the shell script expects stdout's last line to be exactly one
  // JSON object, always, even on a failure this module itself did not
  // anticipate.
  process.stdout.write(`${JSON.stringify({ ok: false, stage: 'unexpected', code: 'UNEXPECTED', message: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
