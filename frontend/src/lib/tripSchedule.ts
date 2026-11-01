// Saída e volta da viagem: o painel mostra data + hora; a API guarda startDateISO + departureTime
// e endDateISO + returnTime (o site lê esses campos). Funções puras, testadas em tests/tripSchedule.test.ts.
import { isDateOnlyIso, isoToLocalInput } from './dateInput';

export interface StoredSchedule {
  startDateISO: string | null | undefined;
  departureTime: string | null | undefined;
  endDateISO: string | null | undefined;
  returnTime: string | null | undefined;
}

/** O que o painel mostra: data 'AAAA-MM-DD' e hora 'HH:mm' (vazio = não informado). */
export interface ScheduleFields {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** '05h30' / '5h' / '05:30' -> '05:30' (campo de hora). Texto que não é hora -> ''. */
export function timeToInput(text: string | null | undefined): string {
  const m = /^\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*$/i.exec(text ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${pad(h)}:${pad(min)}`;
}

/** '05:30' (campo de hora) -> '05h30', formato que o site mostra. Vazio/inválido -> ''. */
export function inputToTime(value: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value ?? '');
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return `${m[1]}h${m[2]}`;
}

const datePart = (iso: string | null | undefined) => isoToLocalInput(iso).slice(0, 10);

// Hora de um momento: a hora guardada (05h30) ou, na falta dela, a hora real do instante.
// Data "só com o dia" (00:00 UTC) não tem hora: nada de horário falso.
function timePart(iso: string | null | undefined, time: string | null | undefined): string {
  const fromText = timeToInput(time);
  if (fromText) return fromText;
  if (!iso || isDateOnlyIso(iso)) return '';
  return isoToLocalInput(iso).slice(11, 16);
}

/** Valores guardados -> campos do painel. */
export function scheduleToFields(s: StoredSchedule): ScheduleFields {
  return {
    startDate: datePart(s.startDateISO),
    startTime: timePart(s.startDateISO, s.departureTime),
    endDate: datePart(s.endDateISO),
    endTime: timePart(s.endDateISO, s.returnTime),
  };
}

const dateOnlyIso = (date: string) => `${date}T00:00:00.000Z`;

function momentToStored(
  date: string, time: string,
  originalIso: string | null | undefined, originalTime: string | null | undefined,
  original: { date: string; time: string },
): { iso: string | null; time: string | null } {
  const iso = !date ? null : (originalIso && date === original.date ? originalIso : dateOnlyIso(date));
  // Se a hora antiga vinha embutida no ISO (sem coluna de horário) e a data muda,
  // materializa essa hora na coluna própria para não perdê-la ao salvar a nova data.
  const hour = time === original.time
    ? (date === original.date ? (originalTime ?? null) : (inputToTime(original.time) || null))
    : (inputToTime(time) || null);
  return { iso, time: hour };
}

/**
 * Campos do painel -> valores a gravar. Parte que não foi alterada volta exatamente como estava
 * (`original`), então abrir e salvar sem mexer não muda nada. Data nova vira "só o dia" (00:00 UTC)
 * e a hora vai em departureTime / returnTime, sem deslocar o dia.
 */
export function fieldsToSchedule(fields: ScheduleFields, original?: StoredSchedule | null): StoredSchedule & { startDateISO: string | null; departureTime: string | null; endDateISO: string | null; returnTime: string | null } {
  const base = original ?? { startDateISO: null, departureTime: null, endDateISO: null, returnTime: null };
  const was = scheduleToFields(base);
  const start = momentToStored(fields.startDate, fields.startTime, base.startDateISO, base.departureTime, { date: was.startDate, time: was.startTime });
  const end = momentToStored(fields.endDate, fields.endTime, base.endDateISO, base.returnTime, { date: was.endDate, time: was.endTime });
  return { startDateISO: start.iso, departureTime: start.time, endDateISO: end.iso, returnTime: end.time };
}
