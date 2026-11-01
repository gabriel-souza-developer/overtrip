import { describe, it, expect, afterEach } from 'vitest';
import { formatDateBR, isDateOnlyIso, isoToLocalInput, localInputToIso } from '../frontend/src/lib/dateInput';
import { visitCreateSchema, tripCreateSchema, galleryCreateSchema } from '../src/validators';

const originalTz = process.env.TZ;
afterEach(() => { process.env.TZ = originalTz; });

describe('dateInput', () => {
  it('mostra a hora local, não a UTC (America/Sao_Paulo, UTC-3)', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(isoToLocalInput('2026-12-01T21:00:00.000Z')).toBe('2026-12-01T18:00');
  });

  it('converte o valor do input para ISO com fuso', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(localInputToIso('2026-12-01T18:00')).toBe('2026-12-01T21:00:00.000Z');
  });

  it('ida e volta preserva o instante em vários fusos', () => {
    for (const tz of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo', 'America/New_York']) {
      process.env.TZ = tz;
      const iso = '2026-07-15T03:30:00.000Z';
      expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
      expect(isoToLocalInput(localInputToIso('2026-03-10T08:15')!)).toBe('2026-03-10T08:15');
    }
  });

  it('valor vazio ou inválido vira null / string vazia, nunca string vazia no envio', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso(null)).toBeNull();
    expect(localInputToIso(undefined)).toBeNull();
    expect(localInputToIso('lixo')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('')).toBe('');
    expect(isoToLocalInput('lixo')).toBe('');
  });

  it('a saída passa nos schemas de visita, viagem e galeria', () => {
    process.env.TZ = 'America/Sao_Paulo';
    const iso = localInputToIso('2026-12-01T18:00')!;
    expect(visitCreateSchema.safeParse({ title: 'v', city: 'c', region: 'r', date: iso }).success).toBe(true);
    expect(visitCreateSchema.safeParse({ title: 'v', city: 'c', region: 'r', date: localInputToIso('') }).success).toBe(true);
    expect(visitCreateSchema.safeParse({ title: 'v', city: 'c', region: 'r', date: '2026-12-01T18:00' }).success).toBe(false);
    expect(tripCreateSchema.safeParse({
      title: 't', category: 'c', description: 'd', city: 'c', region: 'r',
      startDateISO: iso, endDateISO: localInputToIso(''),
    }).success).toBe(true);
    expect(tripCreateSchema.safeParse({
      title: 't', category: 'c', description: 'd', city: 'c', region: 'r',
      startDateISO: iso, endDateISO: localInputToIso('2026-12-02T10:00'),
    }).success).toBe(true);
    expect(galleryCreateSchema.safeParse({
      title: 'g', date: iso, dateDisplay: '1 de dezembro', description: 'd',
      images: [{ src: 'https://example.com/a.jpg', alt: 'a' }],
    }).success).toBe(true);
  });
});

describe('datas sem hora (meia-noite UTC)', () => {
  it('mostra o dia certo, não o anterior (America/Sao_Paulo)', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(isoToLocalInput('2026-11-29T00:00:00.000Z')).toBe('2026-11-29T00:00');
    expect(formatDateBR('2026-11-29T00:00:00.000Z')).toBe('29/11/2026');
    expect(formatDateBR('2026-10-18T00:00:00.000Z')).toBe('18/10/2026');
  });

  it('o mesmo dia em fusos a leste e a oeste', () => {
    for (const tz of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo', 'Pacific/Honolulu']) {
      process.env.TZ = tz;
      expect(formatDateBR('2026-11-29T00:00:00.000Z')).toBe('29/11/2026');
      expect(isoToLocalInput('2026-11-29T00:00:00.000Z')).toBe('2026-11-29T00:00');
    }
  });

  it('abrir e salvar sem mexer devolve o valor original (nada de 21:00)', () => {
    for (const tz of ['America/Sao_Paulo', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      for (const original of ['2026-11-29T00:00:00.000Z', '2026-07-15T03:30:00.000Z']) {
        expect(localInputToIso(isoToLocalInput(original), original)).toBe(original);
      }
    }
  });

  it('instante com hora que cai à meia-noite local continua sem mudar se a data não foi mexida', () => {
    process.env.TZ = 'America/Sao_Paulo';
    const original = '2026-11-29T03:00:00.000Z'; // 00:00 em São Paulo
    expect(isoToLocalInput(original)).toBe('2026-11-29T00:00');
    expect(localInputToIso('2026-11-29T00:00', original)).toBe(original);
  });

  it('trocar o dia grava a meia-noite UTC do dia escolhido', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(localInputToIso('2026-12-05T00:00', '2026-11-29T00:00:00.000Z')).toBe('2026-12-05T00:00:00.000Z');
    expect(localInputToIso('2026-12-05T00:00')).toBe('2026-12-05T00:00:00.000Z');
  });

  it('data com hora continua no horário local', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(formatDateBR('2026-12-01T21:00:00.000Z')).toBe('01/12/2026');
    expect(formatDateBR('2026-12-02T01:00:00.000Z')).toBe('01/12/2026');
  });

  it('vazio ou inválido', () => {
    expect(formatDateBR(null)).toBe('—');
    expect(formatDateBR('lixo')).toBe('—');
    expect(isDateOnlyIso('2026-11-29T00:00:00.000Z')).toBe(true);
    expect(isDateOnlyIso('2026-11-29T00:00:01.000Z')).toBe(false);
  });
});
