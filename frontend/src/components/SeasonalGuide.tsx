import React from 'react';
import { CalendarDays, CloudRain, Compass, ExternalLink, MapPin, Sun, Waves } from 'lucide-react';
import { FEEDBACK_CHECKED_AT, FEEDBACK_DISCLAIMER, VISITOR_FEEDBACK } from '../lib/paraibaSeason';
import {
  getStateByCode, isZoneRainyInMonth, MONTH_NAMES, monthRainSummary, NORTHEAST_STATES, SEASONAL_DISCLAIMER,
} from '../lib/northeastSeason';
import { capitalizeFirst } from '../lib/tripCalendar';

const NewTab = () => <><ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></>;

/** Climatologia por estado; o período selecionado sincroniza com o calendário do Início. */
export default function SeasonalGuide({ month, onMonthChange }: { month: Date; onMonthChange: (month: Date) => void }) {
  const [stateCode, setStateCode] = React.useState('PB');
  const selectedState = getStateByCode(stateCode);
  const monthIndex = month.getMonth();
  const year = month.getFullYear();
  const label = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, i) => currentYear - 2 + i);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);

  const setMonth = (nextMonth: number) => onMonthChange(new Date(year, nextMonth, 1));
  const setYear = (nextYear: number) => onMonthChange(new Date(nextYear, monthIndex, 1));

  return (
    <section aria-labelledby="sazonal-title" className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800"><Compass className="h-4 w-4" aria-hidden="true" />Clima e época · Nordeste</p>
            <h2 id="sazonal-title" className="mt-1 text-xl font-bold tracking-tight text-surface-900 sm:text-2xl">Planeje pela época e pelo estado</h2>
            <p className="mt-1 text-sm text-surface-600">Referências sazonais por estado para ajudar a escolher entre praia, trilha, rio ou um roteiro urbano.</p>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto xl:min-w-[520px]">
            <label className="text-xs font-semibold text-surface-700">Mês
              <select aria-label="Mês do planejamento sazonal" value={monthIndex} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 text-sm text-surface-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-200">
                {MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-surface-700">Ano
              <select aria-label="Ano do planejamento sazonal" value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 text-sm text-surface-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-200">
                {years.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-surface-700">Estado
              <select aria-label="Estado do planejamento sazonal" value={stateCode} onChange={(event) => setStateCode(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 text-sm text-surface-900 shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-200">
                {NORTHEAST_STATES.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-surface-700"><CalendarDays className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />Consulta: {label}</span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">Tendência histórica, não é previsão</span>
          <span className="text-xs text-surface-600">O período pode ser consultado mesmo sem viagem cadastrada.</span>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-800 shadow-sm"><Waves className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="text-xs font-bold uppercase tracking-wide text-emerald-900">{selectedState.name} em {capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(month))}</p>
            <p className="mt-1 text-sm leading-relaxed text-surface-800">{monthRainSummary(selectedState, monthIndex)}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div><h3 className="text-base font-bold text-surface-900">Referências por região</h3><p className="mt-0.5 text-xs text-surface-600">Cada cartão informa o recorte coberto pela fonte; o padrão pode variar entre municípios.</p></div>
          <span className="hidden rounded-full bg-surface-100 px-2.5 py-1 text-xs font-semibold text-surface-700 sm:inline">{selectedState.zones.length} {selectedState.zones.length === 1 ? 'referência' : 'referências'}</span>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {selectedState.zones.map((zone) => {
            const rainy = isZoneRainyInMonth(zone, monthIndex);
            const coastal = /litoral|cost|leste sergipano/i.test(`${zone.name} ${zone.places}`);
            const ToneIcon = rainy ? CloudRain : Sun;
            return <article key={zone.name} className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div><h4 className="font-semibold text-surface-900">{zone.name}</h4><p className="mt-0.5 flex items-center gap-1 text-xs text-surface-600"><MapPin className="h-3 w-3" aria-hidden="true" />{zone.places}</p></div>
                <span className={`inline-flex self-start shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${rainy ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><ToneIcon className="h-3.5 w-3.5" aria-hidden="true" />{rainy ? 'Dentro do período citado' : 'Fora do período citado'}</span>
              </div>
              <p className="mt-3 text-sm font-medium text-surface-800">Referência sazonal: {zone.periodLabel}.</p>
              <p className="mt-1 text-xs leading-relaxed text-surface-600">{rainy
                ? 'Tenha um roteiro urbano ou cultural como alternativa para dias chuvosos. Cachoeiras e rios dependem da chuva local: confirme vazão, acesso e alertas, sem presumir que estarão próprios para visita.'
                : coastal
                  ? 'Na faixa costeira, praias e piscinas naturais podem entrar no planejamento; em outras áreas, considere trilhas e sítios naturais. Piscinas dependem da maré: confira previsão, mar e acesso.'
                  : 'Trilhas, sítios históricos e outros passeios ao ar livre podem entrar no planejamento. Para rios e cachoeiras, confirme vazão, previsão e acesso local.'}</p>
              <div className="mt-3 border-t border-surface-100 pt-3"><a href={zone.source.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary-800 hover:underline">{zone.source.label}<NewTab /></a><p className="mt-1 text-xs leading-relaxed text-surface-600">{zone.source.supports}</p></div>
            </article>;
          })}
        </div>

        <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-surface-700">Condição atualizada perto da viagem</p>
          <p className="mt-1 text-xs text-surface-600">A fonte estadual de {selectedState.name} é a referência para previsão e monitoramento: <a href={selectedState.forecast.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-800 hover:underline">{selectedState.forecast.label}<NewTab /></a> {selectedState.forecast.supports}</p>
          <p className="mt-1 text-xs text-surface-600">Em passeios costeiros, confirme também a tábua de marés e as condições do mar.</p>
          <a href="https://www.marinha.mil.br/chm/tabuas-de-mare" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center text-xs font-semibold text-primary-800 hover:underline">Marinha do Brasil — tábuas de marés<NewTab /></a>
        </div>

        {selectedState.code === 'PB' && <details className="group mt-4 rounded-xl border border-surface-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-surface-800">Opiniões de visitantes na Paraíba</summary>
          <div className="mt-3 space-y-2">{VISITOR_FEEDBACK.map((item) => <div key={item.place} className="text-xs text-surface-700"><a href={item.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-800 hover:underline">{item.place} no Tripadvisor<NewTab /></a><ul className="mt-1 list-disc space-y-0.5 pl-5">{item.themes.map((theme) => <li key={theme}>{theme}</li>)}</ul></div>)}<p className="text-xs text-surface-500">Consultado em {FEEDBACK_CHECKED_AT}. {FEEDBACK_DISCLAIMER}</p></div>
        </details>}

        <p className="mt-4 text-xs leading-relaxed text-surface-500" role="note">{SEASONAL_DISCLAIMER}</p>
      </div>
    </section>
  );
}
