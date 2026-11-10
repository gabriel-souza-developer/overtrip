import { CalendarDays, CircleCheck, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { formatDateBR } from '../lib/dateInput';
import { formatBRL } from '../lib/formHelpers';
import { resolveAssetSrc } from '../lib/assetUrl';
import { displayTime } from '../lib/tripSchedule';
import { tripStatusLabel } from '../lib/panelHelpers';

type PreviewTrip = {
  title: string; headlineDisplay: string; category: string; description: string;
  city: string; region: string; startDateISO: string; departureTime: string;
  returnTime: string; scheduleInfo: string; scheduleTBD: boolean; priceValue: number | null;
  priceDisplay: string; priceUnit: string; free: boolean; meetingCity: string;
  meetingPoint: string; meetingTBD: boolean; media: Array<{ src: string; alt: string; type?: string }>;
  buttonLabel: string; buttonClass: string;
  status: string;
  intensityClass?: string;
  includes?: string[];
  includesHighlight?: string;
  itinerary?: string[];
  routeNotes?: string[];
  importantInfo?: string[];
  trailDistance?: string;
  supportPoint?: string;
  supportPointInfo?: string;
  departures?: Array<{ time: string; place: string; city: string }>;
};

const buttonClass: Record<string, string> = {
  'button-dark': 'bg-surface-900 text-white',
  'button-rust': 'bg-primary-500 text-white',
  'button-light': 'bg-white text-surface-900 border border-surface-300',
  'button-outline': 'border border-surface-700 text-surface-900',
};

function PreviewCover({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="flex h-full items-center justify-center text-sm text-surface-600">Não foi possível carregar a capa</div> : <img src={resolveAssetSrc(src.trim())} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}

export default function TripCardPreview({ trip }: { trip: PreviewTrip }) {
  const [includesOpen, setIncludesOpen] = useState(false);
  const cover = trip.media.find(item => item.type !== 'video') ?? trip.media[0];
  const title = trip.title.trim() || 'Nome da viagem';
  const intensity = ({ leve: 'leve', moderado: 'moderada', intenso: 'intensa', extremo: 'extrema' } as Record<string, string>)[trip.intensityClass?.trim().toLowerCase() || ''] || trip.intensityClass?.trim();
  // Mesmas regras do site (js/render.js): hora no formato '05h30' e embarque "Cidade (Local)".
  const schedule = trip.scheduleInfo.trim() || [displayTime(trip.departureTime), displayTime(trip.returnTime)].filter(Boolean).join(' às ') || (trip.scheduleTBD ? 'Horário a confirmar' : 'Horário não informado');
  const meetingCity = trip.meetingCity.trim();
  const meetingPoint = trip.meetingPoint.trim();
  const departure = trip.meetingTBD ? 'Embarque a confirmar' : (meetingCity && meetingPoint ? `${meetingCity} (${meetingPoint})` : meetingCity || meetingPoint || 'Embarque não informado');
  const price = trip.free ? 'Gratuito' : trip.priceDisplay.trim() || (trip.priceValue ? formatBRL(trip.priceValue) : 'Consulte');

  return (
    <aside className="rounded-xl border border-surface-200 bg-surface-50 p-4" aria-label="Prévia do card no site">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div><h3 className="font-semibold text-surface-900">Prévia do card</h3><p className="text-sm text-surface-600">Acompanhe como os dados aparecem no site.</p></div>
        <span className="badge badge-info">{tripStatusLabel(trip.status || 'DRAFT')}</span>
      </div>
      <article className="site-card-preview overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-surface-200">
        <div className="aspect-[16/9] bg-surface-200 relative">
          {cover ? <PreviewCover key={cover.src} src={cover.src} alt={cover.alt || title} /> : <div className="flex h-full items-center justify-center text-sm text-surface-600">A capa aparecerá aqui</div>}
          {intensity && <span className="absolute right-3 bottom-3 rounded-full bg-surface-900/90 px-3 py-1 text-xs font-semibold text-white">Nível: {intensity}</span>}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">{trip.category.trim() || 'Viagem'}</p>
          <h4 className="text-lg font-semibold text-surface-900">{title}</h4>
          <p className="line-clamp-2 text-sm text-surface-700">{trip.description.trim() || 'O resumo da experiência aparecerá aqui.'}</p>
          <div className="space-y-2 text-sm text-surface-700">
            <p className="flex gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-primary-500" aria-hidden="true" />{formatDateBR(trip.startDateISO)}</p>
            <p className="flex gap-2"><Clock3 className="h-4 w-4 shrink-0 text-primary-500" aria-hidden="true" />{schedule}</p>
            <div className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary-500" aria-hidden="true" /><div>{!trip.meetingTBD && trip.departures?.length ? <ul className="space-y-1">{trip.departures.map((point, index) => <li key={index}>{[point.time, point.place, point.city].filter(Boolean).join(' · ') || 'Ponto não informado'}</li>)}</ul> : departure}</div></div>
          </div>
          <details className="trip-includes-toggle" onToggle={event => setIncludesOpen(event.currentTarget.open)}>
            <summary><span className="trip-includes-toggle-label">{includesOpen ? 'Ocultar detalhes' : 'Ver roteiro & o que inclui'}</span></summary>
            <div className="trip-includes-body">
              {!!trip.includes?.length && <><p className="trip-includes-heading">O que inclui</p><ul className="trip-includes">{trip.includes.map((item, index) => <li key={`${item}-${index}`}><span className="trip-includes-icon"><CircleCheck aria-hidden="true" /></span><span>{item}</span></li>)}</ul></>}
              {trip.includesHighlight && <div className="trip-includes-highlight"><span className="trip-includes-highlight-icon"><ShieldCheck aria-hidden="true" /></span><span>{trip.includesHighlight}</span></div>}
              {!!trip.itinerary?.length && <div className="trip-details-section"><p className="trip-includes-heading">Roteiro</p><ol className="trip-details-list trip-details-list--ordered">{trip.itinerary.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol></div>}
              {(trip.trailDistance || trip.supportPoint || trip.supportPointInfo || !!trip.routeNotes?.length) && <div className="trip-details-section"><p className="trip-includes-heading">Sobre o percurso</p><ul className="trip-details-list">
                {trip.trailDistance && <li>Percurso: {trip.trailDistance}</li>}
                {trip.supportPoint && <li>Ponto de apoio: {trip.supportPoint}{trip.supportPointInfo && <> <span className="trip-details-note">({trip.supportPointInfo})</span></>}</li>}
                {!trip.supportPoint && trip.supportPointInfo && <li>{trip.supportPointInfo}</li>}
                {trip.routeNotes?.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul></div>}
              {!!trip.importantInfo?.length && <div className="trip-details-section"><p className="trip-includes-heading">Informações importantes</p><ul className="trip-details-list">{trip.importantInfo.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
            </div>
          </details>
          <div className="flex items-center justify-between gap-3 border-t border-surface-200 pt-3">
            <div><p className="text-lg font-bold text-surface-900">{price}</p>{!trip.free && <p className="text-xs text-surface-600">{trip.priceUnit || 'por pessoa'}</p>}</div>
            <span className={`rounded-lg px-3 py-2 text-sm font-semibold ${buttonClass[trip.buttonClass] || buttonClass['button-dark']}`}>{trip.buttonLabel || 'Quero viajar'}</span>
          </div>
        </div>
      </article>
    </aside>
  );
}
