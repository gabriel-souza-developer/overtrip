import React from 'react';
import { CloudRain, ExternalLink, Info, MapPin, Star, Sun, CloudSun, PartyPopper } from 'lucide-react';
import { CLIMATE_SOURCES, RAIN_LABELS, REGION_LABELS, SEASON_DISCLAIMER, TOURISM_SOURCES, mapsSearchUrl, seasonalGuide, type RainLevel, type SeasonRegion, type SeasonSource } from '../lib/paraibaSeason';
import { capitalizeFirst } from '../lib/tripCalendar';

const RAIN_STYLE: Record<RainLevel, { className: string; Icon: typeof Sun }> = {
  baixa: { className: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Sun },
  moderada: { className: 'bg-sky-50 text-sky-800 border-sky-200', Icon: CloudSun },
  alta: { className: 'bg-blue-50 text-blue-800 border-blue-200', Icon: CloudRain },
};
const REGIONS: SeasonRegion[] = ['litoral', 'agreste', 'sertao'];

function SourceList({ title, sources }: { title: string; sources: SeasonSource[] }) {
  return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-surface-600">{title}</h4>
    <ul className="mt-1.5 space-y-1">{sources.map((source) => <li key={source.url} className="text-xs text-surface-700">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-800 hover:underline">{source.label}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></a>
      <span className="text-surface-600"> — {source.supports}</span>
    </li>)}</ul></div>;
}

/** Orientação climatológica (não previsão) para o mês/ano do calendário do Início. */
export default function SeasonalGuide({ month }: { month: Date }) {
  const guide = seasonalGuide(month.getFullYear(), month.getMonth());
  if (!guide) return null;
  const label = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month));
  return (
    <section aria-labelledby="sazonal-title" className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-800">Planejamento sazonal · Paraíba</p>
          <h2 id="sazonal-title" className="mt-1 text-lg font-bold text-surface-900">O que costuma funcionar em {label}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900"><Info className="h-3.5 w-3.5" aria-hidden="true" />Orientação climatológica, não é previsão</span>
      </div>
      <p className="mt-2 text-sm text-surface-600">Acompanha o mês escolhido no calendário acima. Baseado em médias históricas (normais 1991–2020) e nos períodos chuvosos de cada região.</p>

      <ul className="mt-4 grid gap-3 md:grid-cols-3" aria-label={`Clima típico por região em ${label}`}>
        {REGIONS.map((region) => {
          const climate = guide.regions[region];
          const { className, Icon } = RAIN_STYLE[climate.rain];
          return <li key={region} className={`rounded-xl border p-4 ${className}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{REGION_LABELS[region].name}</span><span className="inline-flex items-center gap-1 text-xs font-semibold"><Icon className="h-4 w-4" aria-hidden="true" />{RAIN_LABELS[climate.rain]}</span></div>
            <p className="mt-0.5 text-xs opacity-80">{REGION_LABELS[region].places}</p>
            <p className="mt-2 text-sm">{climate.note}</p>
          </li>;
        })}
      </ul>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-900"><Star className="h-4 w-4 text-primary-700" aria-hidden="true" />Atividades recomendadas</h3>
          <ul className="mt-2 space-y-2">{guide.activities.map((activity) => <li key={activity.title} className="rounded-xl border border-surface-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="font-semibold text-surface-900">{activity.title}</span><span className="inline-flex items-center gap-1 text-xs text-surface-600"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{activity.where}</span></div>
            <p className="mt-1 text-sm text-surface-700">{activity.why}</p>
            <a href={mapsSearchUrl(activity.mapsQuery)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-800 hover:underline">Ver avaliações no Google Maps<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></a>
          </li>)}</ul>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-900"><PartyPopper className="h-4 w-4 text-primary-700" aria-hidden="true" />Calendário de eventos</h3>
            {guide.events.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-surface-700">{guide.events.map((event) => <li key={event}>{event}</li>)}</ul> : <p className="mt-2 text-sm text-surface-600">Sem evento fixo de destaque neste mês.</p>}
            <p className="mt-2 text-xs text-surface-600">Datas mudam a cada ano: confirme nos canais oficiais antes de divulgar.</p>
          </div>
          <SourceList title="Clima e chuvas" sources={CLIMATE_SOURCES} />
          <SourceList title="Turismo e avaliações" sources={TOURISM_SOURCES} />
        </div>
      </div>
      <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">{SEASON_DISCLAIMER}</p>
    </section>
  );
}
