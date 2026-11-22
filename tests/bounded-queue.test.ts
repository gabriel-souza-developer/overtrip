import { describe, it, expect } from 'vitest';
import { createBoundedQueue } from '../src/services/boundedQueue.js';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('createBoundedQueue: concorrência limitada', () => {
  it('nunca executa mais jobs simultâneos do que a concorrência configurada', async () => {
    const queue = createBoundedQueue({ concurrency: 2, maxQueueSize: 10 });
    let active = 0;
    let maxActive = 0;
    const gates = Array.from({ length: 5 }, () => deferred());

    gates.forEach((gate, i) => {
      queue.enqueue(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active--;
      });
      void i;
    });

    // Libera uma de cada vez: nunca deve ter passado de 2 simultâneas.
    for (const gate of gates) {
      await new Promise((r) => setTimeout(r, 10));
      gate.resolve();
    }
    await queue.idle();

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

describe('createBoundedQueue: tamanho máximo (controle de abuso)', () => {
  it('descarta (enqueue retorna false) além do limite, sem executar o job descartado', async () => {
    const queue = createBoundedQueue({ concurrency: 1, maxQueueSize: 2 });
    const blocker = deferred();
    const ran: number[] = [];

    expect(queue.enqueue(async () => { await blocker.promise; ran.push(1); })).toBe(true); // ocupa o único slot ativo
    expect(queue.enqueue(async () => { ran.push(2); })).toBe(true); // fila: 1/2
    expect(queue.enqueue(async () => { ran.push(3); })).toBe(true); // fila: 2/2
    expect(queue.enqueue(async () => { ran.push(4); })).toBe(false); // além do limite: descartado

    blocker.resolve();
    await queue.idle();

    expect(ran.sort()).toEqual([1, 2, 3]);
  });
});

describe('createBoundedQueue: idle()', () => {
  it('resolve de imediato quando não há nada agendado', async () => {
    const queue = createBoundedQueue({ concurrency: 1, maxQueueSize: 1 });
    await expect(queue.idle()).resolves.toBeUndefined();
  });

  it('só resolve depois que os jobs agendados terminarem', async () => {
    const queue = createBoundedQueue({ concurrency: 1, maxQueueSize: 1 });
    let finished = false;
    queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 30));
      finished = true;
    });
    await queue.idle();
    expect(finished).toBe(true);
  });
});
