type Job = () => Promise<void>;

/**
 * Fila assíncrona em processo, com concorrência e tamanho limitados.
 * Serve para desacoplar o tempo de resposta ao cliente da latência real de
 * um provedor externo (ex.: envio de e-mail): `enqueue` nunca espera o job
 * terminar, só agenda. Além do limite de taxa por IP/e-mail já aplicado
 * antes de chegar aqui, isto garante que o processo nunca acumula trabalho
 * ou conexões concorrentes sem limite, mesmo sob abuso ou provedor lento.
 *
 * Limitações conhecidas, por ser só memória de um único processo (nenhuma
 * fila externa, por não haver necessidade/autorização para introduzir uma):
 * - Nada sobrevive a um restart/crash do processo: um job agendado e ainda
 *   não executado se perde. Aceitável aqui porque o e-mail de redefinição já
 *   é "melhor esforço" (sem retry, ver passwordResetService.ts) — perder um
 *   job equivale a uma falha de envio, que já é um caminho tratado.
 * - Não é compartilhada entre processos: com mais de uma instância do
 *   servidor (ex.: vários processos atrás do mesmo balanceador), cada uma
 *   tem sua própria fila e seu próprio limite de 200 — o teto de abuso é
 *   por processo, não um teto global agregado.
 * - Sem retry/backoff: um job que falha (erro ou timeout) não é tentado de
 *   novo; só é registrado e o token correspondente é descartado. Decisão
 *   deliberada (retry mudaria a janela de tempo entre contas existentes e
 *   inexistentes), não uma omissão.
 */
export function createBoundedQueue(opts: { concurrency: number; maxQueueSize: number }) {
  const pending: Job[] = [];
  let active = 0;
  let idleWaiters: Array<() => void> = [];

  function notifyIfIdle() {
    if (pending.length === 0 && active === 0 && idleWaiters.length > 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  function pump() {
    while (active < opts.concurrency && pending.length > 0) {
      const job = pending.shift()!;
      active++;
      job()
        .catch((err) => {
          console.error('Erro inesperado em job da fila assíncrona.', err);
        })
        .finally(() => {
          active--;
          notifyIfIdle();
          pump();
        });
    }
  }

  return {
    /** Agenda o job; retorna false (e descarta) se a fila já está no limite. */
    enqueue(job: Job): boolean {
      if (pending.length >= opts.maxQueueSize) return false;
      pending.push(job);
      pump();
      return true;
    },
    /** Só para testes: espera a fila esvaziar e os jobs ativos terminarem. */
    idle(): Promise<void> {
      if (pending.length === 0 && active === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    size(): number {
      return pending.length + active;
    },
    /**
     * Checagem otimista de espaço antes de fazer trabalho que só vale a pena
     * se o job puder ser agendado (ex.: não criar um registro que seria
     * descartado em seguida). Entre esta checagem e o `enqueue` real pode
     * entrar outro `enqueue`: o pior caso é a fila passar um pouco do limite
     * configurado, nunca um comportamento inseguro — quem chama ainda trata
     * um `enqueue` que retorna false mesmo depois de ver espaço aqui.
     */
    hasRoom(): boolean {
      return pending.length < opts.maxQueueSize;
    },
  };
}
