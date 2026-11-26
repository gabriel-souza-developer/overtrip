import React from 'react';
import { CloudRain, CloudSun, ExternalLink, Info, MapPin, Sun } from 'lucide-react';
import {
  CLIMATE_SOURCES, FEEDBACK_CHECKED_AT, FEEDBACK_DISCLAIMER, FORECAST_SOURCES, PHASE_LABELS, SEASON_DISCLAIMER, VISITOR_FEEDBACK, ZONES,
  isRainy, mapsSearchUrl, seasonalGuide, type RainPhase, type SeasonSource,
} from '../lib/paraibaSeason';
import { capitalizeFirst } from '../lib/tripCalendar';

const PHASE_STYLE = (phase: RainPhase) => (isRainy(phase)
  ? { className: 'border-blue-200 bg-blue-50 text-blue-900', Icon: CloudRain }
  : phase === 'seco' ? { className: 'border-amber-200 bg-amber-50 text-amber-900', Icon: Sun } : { className: 'border-sky-200 bg-sky-50 text-sky-900', Icon: CloudSun });

const NewTab = () => <><ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></>;

function SourceList({ title, sources }: { title: string; sources: SeasonSource[] }) {
  return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-surface-600">{title}</h4>
    <ul className="mt-1.5 space-y-1">{sources.map((source) => <li key={source.url} className="text-xs text-surface-700">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-800 hover:underline">{source.label}<NewTab /></a>
      <span className="text-surface-600"> — {source.supports}</span>
    </li>)}</ul></div>;
}

/** Orientação climatológica (não previsão) para o mês do calendário do Início. */
export default function SeasonalGuide({ month }: { month: Date }) {
  const guide = seasonalGuide(month.getMonth());
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
      <p className="mt-2 text-sm font-medium text-surface-800">{guide.summary}</p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label={`Período chuvoso típico por região em ${label}`}>
        {guide.zones.map(({ zone, phase }) => {
          const { className, Icon } = PHASE_STYLE(phase);
          return <li key={zone} className={`rounded-xl border px-3 py-2.5 ${className}`}>
            <span className="block text-sm font-semibold">{ZONES[zone].name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs font-medium"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{PHASE_LABELS[phase]}</span>
            <span className="mt-0.5 block text-[11px] opacity-80">Chuvas de {ZONES[zone].windowLabel} · {ZONES[zone].places}</span>
          </li>;
        })}
      </ul>

      <h3 className="mt-4 text-sm font-semibold text-surface-900">Recomendações do mês</h3>
      <ul className="mt-2 grid gap-2 md:grid-cols-2">{guide.activities.map((activity) => <li key={activity.title} className="rounded-xl border border-surface-200 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="font-semibold text-surface-900">{activity.title}</span><span className="inline-flex items-center gap-1 text-xs text-surface-600"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{activity.where}</span></div>
        <p className="mt-1 text-sm text-surface-700">{activity.why}</p>
        <a href={mapsSearchUrl(activity.mapsQuery)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-800 hover:underline">Ver no Google Maps<NewTab /></a>
      </li>)}</ul>

      <details className="group mt-4 rounded-xl border border-surface-200 bg-surface-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-surface-900">Fontes, opiniões de visitantes e previsão atual</summary>
        <div className="mt-3 space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-600">Opiniões de visitantes (consultadas em {FEEDBACK_CHECKED_AT})</h4>
            <ul className="mt-1.5 space-y-2">{VISITOR_FEEDBACK.map((item) => <li key={item.place} className="text-xs text-surface-700">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-800 hover:underline">{item.place} no Tripadvisor<NewTab /></a>
              <ul className="mt-0.5 list-disc pl-5">{item.themes.map((theme) => <li key={theme}>{theme}</li>)}</ul>
            </li>)}</ul>
            <p className="mt-1.5 text-xs text-surface-600">{FEEDBACK_DISCLAIMER}</p>
          </div>
          <SourceList title="Previsão, avisos e marés (consulte perto da data)" sources={FORECAST_SOURCES} />
          <SourceList title="Climatologia (períodos chuvosos)" sources={CLIMATE_SOURCES} />
        </div>
      </details>
      <p className="mt-3 text-xs text-amber-900" role="note">{SEASON_DISCLAIMER}</p>
    </section>
  );
}
