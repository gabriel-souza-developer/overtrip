import React from 'react';
import { CloudRain, Compass, ExternalLink, MapPin, Sparkles, Sun, Waves } from 'lucide-react';
import { ApiRequestError, Trip, travelInsightsApi } from '../api';
import { getStateByCode, isZoneRainyInMonth, NORTHEAST_STATES } from '../lib/northeastSeason';
import { capitalizeFirst, tripDay } from '../lib/tripCalendar';

const NewTab = () => <><ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></>;
const REGION_COLORS: Record<string, string> = { '1': '#8A9A38', '2': '#6754A3', '3': '#43866B', '4': '#B17C3F', '5': '#258A8A', '6': '#8C5E69' };
const searchLinks = (query: string) => {
  const q = encodeURIComponent(query);
  return [
    { label: 'Avaliações de viajantes', url: `https://www.google.com/search?q=${q}+site%3Atripadvisor.com.br+OR+site%3Atripadvisor.com` },
    { label: 'Vídeos no YouTube', url: `https://www.youtube.com/results?search_query=${q}` },
    { label: 'Buscar no TikTok', url: `https://www.tiktok.com/search?q=${q}` },
    { label: 'Buscar no Instagram', url: `https://www.google.com/search?q=${q}+site%3Ainstagram.com` },
  ];
};
const SearchSources = ({ query }: { query: string }) => <details className="mt-2 text-xs">
  <summary className="inline-flex cursor-pointer items-center font-semibold text-primary-800 hover:underline">Ver fontes e opiniões</summary>
  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{searchLinks(query).map(link => <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-800 hover:underline">{link.label}<NewTab /></a>)}</div>
</details>;

/** Orientação sazonal controlada pelo mesmo mês e ano do calendário. */
export default function SeasonalGuide({ month, plannedTrips }: { month: Date; plannedTrips: Trip[] }) {
  const [stateCode, setStateCode] = React.useState('PB');
  const [insight, setInsight] = React.useState<Awaited<ReturnType<typeof travelInsightsApi.analyze>> | null>(null);
  const [insightKey, setInsightKey] = React.useState('');
  const [insightError, setInsightError] = React.useState('');
  const [insightLoading, setInsightLoading] = React.useState(false);
  const insightRequest = React.useRef(0);
  const selectedState = getStateByCode(stateCode);
  const monthIndex = month.getMonth();
  const selectedPeriodKey = `${stateCode}:${month.getFullYear()}-${monthIndex}`;
  const monthName = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(month));
  const label = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month));
  const tripsInMonth = plannedTrips.filter(trip => {
    const [year, monthNumber] = tripDay(trip.startDateISO).split('-').map(Number);
    return monthNumber - 1 === monthIndex && year === month.getFullYear();
  });
  React.useEffect(() => {
    insightRequest.current += 1;
    setInsight(null);
    setInsightKey('');
    setInsightError('');
    setInsightLoading(false);
  }, [selectedPeriodKey]);
  const getInsights = async () => {
    const requestId = ++insightRequest.current;
    const periodKey = selectedPeriodKey;
    setInsightLoading(true); setInsightError('');
    setInsight(null); setInsightKey('');
    try {
      const result = await travelInsightsApi.analyze({ month: monthIndex + 1, year: month.getFullYear(), state: stateCode });
      if (requestId === insightRequest.current) { setInsight(result); setInsightKey(periodKey); }
    } catch (error) {
      if (requestId === insightRequest.current) setInsightError(error instanceof ApiRequestError && error.status === 503 ? error.message : 'Não foi possível concluir a análise. Tente novamente.');
    } finally {
      if (requestId === insightRequest.current) setInsightLoading(false);
    }
  };

  return (
    <>
    <section aria-labelledby="sazonal-title" className="min-w-0 self-start overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
      <header className="border-b border-surface-100 bg-gradient-to-br from-primary-50 via-white to-amber-50 p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-800 shadow-sm"><Compass className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-primary-800">Clima por mês</p><h3 id="sazonal-title" className="mt-0.5 text-lg font-bold text-surface-900">Como costuma ser o tempo</h3><p className="mt-1 text-sm leading-relaxed text-surface-600">Veja ideias de vivências para esta época do ano.</p></div></div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2"><p className="rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-surface-800">{label} <span className="ml-1 text-xs font-normal text-surface-500">mesmo período do calendário</span></p><label className="text-xs font-semibold text-surface-700">Estado
          <select value={stateCode} onChange={event => setStateCode(event.target.value)} className="ml-2 min-h-10 rounded-lg border border-surface-300 bg-white px-3 text-sm text-surface-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-200">{NORTHEAST_STATES.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}</select>
        </label></div>
      </header>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-2.5 rounded-xl border border-surface-200 bg-surface-50 p-3"><Waves className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" /><div><p className="text-sm font-semibold text-surface-900">{selectedState.name} em {monthName}</p><p className="mt-1 text-sm leading-relaxed text-surface-700">{selectedState.code === 'PB' ? 'A chuva varia por região. O mapa resume os períodos mais chuvosos.' : `${selectedState.zones.length} ${selectedState.zones.length === 1 ? 'região com informação disponível' : 'regiões com informações disponíveis'}. São padrões históricos, não a previsão deste ano.`}</p></div></div>

        <section aria-labelledby="ai-insight-title" className="rounded-xl border-2 border-primary-200 bg-primary-50 p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2.5"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary-800" aria-hidden="true" /><div><h3 id="ai-insight-title" className="text-base font-bold text-surface-900">Sugira outra vivência</h3><p className="mt-0.5 text-sm text-surface-700">Combina a agenda, destinos ainda não visitados e fontes atuais de turismo, avaliações e vídeos.</p></div></div><button type="button" className="btn-primary min-h-11 shrink-0 justify-center px-5" onClick={() => void getInsights()} disabled={insightLoading}><Sparkles className="h-4 w-4" aria-hidden="true" />{insightLoading ? 'Pesquisando fontes…' : 'Analisar este mês'}</button></div>
          {insightError && <p className="mt-3 text-sm text-rose-800" role="alert">{insightError}</p>}
          {insight && insightKey === selectedPeriodKey && <div className="mt-3 space-y-2 border-t border-primary-200 pt-3" aria-live="polite"><p className="text-sm text-surface-800">{insight.summary}</p>{insight.suggestions.length > 0 && <ul className="space-y-2">{insight.suggestions.map((item, index) => <li key={`${item.title}-${index}`} className="rounded-lg bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-surface-900">{item.title}</p><span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800">Formato sugerido: {item.format}</span></div><p className="mt-0.5 text-sm text-surface-700">{item.reason}</p><p className="mt-1 text-xs text-surface-500">Base: {item.basis}</p><ul className="mt-2 space-y-1">{item.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary-800 hover:underline">{source.title}<NewTab /></a><span className="ml-1 text-xs text-surface-500">· {source.kind}{source.publishedAt ? ` · ${source.publishedAt}` : ' · sem data de publicação'}</span></li>)}</ul></li>)}</ul>}{insight.questions.length > 0 && <p className="text-sm text-surface-700"><span className="font-semibold">Antes de decidir, confira:</span> {insight.questions.join(' · ')}</p>}<p className="text-xs text-surface-500">Pesquisa feita ao solicitar a análise; resumos e opiniões podem ser subjetivos. Confirme as condições com fontes oficiais e a equipe. Fontes: {insight.source}.</p></div>}
        </section>

      </div>
    </section>

    <section aria-label={`Detalhes de clima e destinos para ${label}`} className="col-span-full min-w-0 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 xl:grid-cols-2">
      <div className="min-w-0">
        {selectedState.code === 'PB' ? <div className="space-y-3">
          <figure className="min-w-0 rounded-xl bg-[#f7f8f6] p-3">
            <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.9fr)]">
              <img src={`${import.meta.env.BASE_URL}paraiba-climate-regions.svg`} alt="Mapa da Paraíba dividido nos seis grupos de municípios usados pela AESA" className="mx-auto block h-[320px] w-full object-contain sm:h-[380px]" />
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-1" aria-label={`Legenda e período de chuva das regiões da Paraíba em ${monthName}`}>
                {selectedState.zones.map(zone => {
                  const rainy = isZoneRainyInMonth(zone, monthIndex);
                  const color = REGION_COLORS[zone.aesaRegionId ?? ''] ?? '#64748b';
                  return <li key={zone.name} className="flex min-w-0 items-start gap-2 rounded-lg border border-surface-200 bg-white/90 px-2 py-1.5">
                    <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
                    <span className="min-w-0"><span className="block text-xs font-semibold leading-4 text-surface-900">{zone.name}</span><span className={`block text-[11px] leading-4 ${rainy ? 'text-sky-800' : 'text-amber-800'}`}>{rainy ? 'No período chuvoso' : 'Fora do pico de chuva'} · {zone.periodLabel}</span></span>
                  </li>;
                })}
              </ul>
            </div>
            <figcaption className="mt-2 px-1 text-center text-[11px] leading-relaxed text-surface-500">Limites municipais: IBGE · Regiões e períodos típicos: AESA · referência histórica, não previsão anual.</figcaption>
          </figure>
          <p className="text-xs leading-relaxed text-surface-600">Confira previsão e acesso perto da data; no litoral, consulte também maré e balneabilidade.</p>
        </div> : <div><h3 className="text-sm font-bold text-surface-900">Referências por região</h3><ul className="mt-2 grid gap-2 sm:grid-cols-2">{selectedState.zones.map(zone => {
          const rainy = isZoneRainyInMonth(zone, monthIndex);
          const Icon = rainy ? CloudRain : Sun;
          return <li key={zone.name} className="rounded-xl border border-surface-200 p-4"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-surface-900">{zone.name}</h4><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${rainy ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900'}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{rainy ? 'Costuma chover mais' : 'Fora desse período'}</span></div><p className="mt-1 flex items-start gap-1 text-sm text-surface-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{zone.places}</p><p className="mt-2 text-sm text-surface-700">Em geral, o período de mais chuva vai de {zone.periodLabel}.</p><a href={zone.source.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-primary-800 hover:underline">{zone.source.label}<NewTab /></a></li>;
        })}</ul><p className="mt-2 text-[11px] text-surface-500">Mapa regional detalhado não disponível para este estado neste painel.</p></div>}

        <div className="rounded-xl border border-surface-200 p-3"><p className="text-xs font-bold text-surface-800">Fontes</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{selectedState.code === 'PB' && <><a href="https://www.aesa.pb.gov.br/aesa-lanca-atlas-pluviometrico-e-estabelece-nova-climatologia-da-paraiba/" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-800 hover:underline">AESA · Atlas pluviométrico<NewTab /></a><a href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-800 hover:underline">IBGE · limites municipais<NewTab /></a></>}<a href={selectedState.forecast.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-800 hover:underline">{selectedState.forecast.label}<NewTab /></a><a href="https://www.marinha.mil.br/chm/tabuas-de-mare" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-800 hover:underline">Marinha · tábuas de marés<NewTab /></a></div></div>

      </div>
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="month-destinations-title" className="rounded-xl border border-surface-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="month-destinations-title" className="text-sm font-bold text-surface-900">Lugares para este mês</h3><p className="mt-1 text-sm text-surface-600">{tripsInMonth.length ? 'Viagens cadastradas neste período; consulte opiniões recentes antes de decidir.' : 'Nenhuma viagem cadastrada neste período. Consulte opiniões de lugares que combinam com a época.'}</p></div></div>
          {tripsInMonth.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{tripsInMonth.map(trip => { const place = [trip.city, trip.region].filter(Boolean).join(', '); const query = `${trip.title} ${place}`; const tripDate = tripDay(trip.startDateISO); return <li key={trip.id} className="rounded-lg bg-surface-50 p-3"><p className="text-sm font-semibold text-surface-900">{trip.title}</p><p className="mt-0.5 text-sm text-surface-600">{place} · {new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${tripDate}T12:00:00`))}</p><SearchSources query={query} /></li>; })}</ul> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{selectedState.zones.filter(zone => isZoneRainyInMonth(zone, monthIndex)).slice(0, 4).map(zone => <li key={zone.name} className="rounded-lg bg-surface-50 p-3"><p className="text-sm font-semibold text-surface-900">{zone.name}</p><p className="mt-0.5 text-sm text-surface-600">{zone.places}</p><SearchSources query={`lugares turísticos ${zone.places} ${selectedState.name}`} /></li>)}</ul>}
          <p className="mt-3 text-xs text-surface-500">As opiniões mudam. Os links abrem uma busca atual; o painel não apresenta avaliações antigas como se fossem recentes.</p>
        </section>

        {selectedState.code !== 'PB' && <p className="text-xs leading-relaxed text-surface-500" role="note">Os dados mostram padrões históricos, não a previsão deste ano. Confirme as condições locais perto da viagem.</p>}
      </div></div>
    </section>
    </>
  );
}
