import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capitalizeFirst } from '../frontend/src/lib/tripCalendar';

describe('datas por extenso no painel', () => {
  it('deixa maiúscula só a primeira letra, como no português', () => {
    expect(capitalizeFirst('terça-feira, 10 de novembro')).toBe('Terça-feira, 10 de novembro');
    expect(capitalizeFirst('novembro de 2026')).toBe('Novembro de 2026');
    expect(capitalizeFirst('')).toBe('');
  });

  it.each(['frontend/src/pages/Dashboard.tsx', 'frontend/src/components/TripCalendar.tsx'])('%s não usa a classe capitalize (que põe maiúscula em cada palavra)', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/\bcapitalize\b/);
  });
});
