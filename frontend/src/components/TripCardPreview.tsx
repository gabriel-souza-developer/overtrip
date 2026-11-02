import { CalendarDays, Clock3, MapPin } from 'lucide-react';
import { formatDateBR } from '../lib/dateInput';
import { formatBRL } from '../lib/formHelpers';

type PreviewTrip = {
  title: string; headlineDisplay: string; category: string; description: string;
  city: string; region: string; startDateISO: string; departureTime: string;
  returnTime: string; scheduleInfo: string; scheduleTBD: boolean; priceValue: number | null;
  priceDisplay: string; priceUnit: string; free: boolean; meetingCity: string;
  meetingPoint: string; meetingTBD: boolean; media: Array<{ src: string; alt: string; type?: string }>;
  buttonLabel: string; buttonClass: string;
};

const buttonClass: Record<string, string> = {
  'button-dark': 'bg-surface-900 text-white',
  'button-rust': 'bg-primary-600 text-white',
  'button-light': 'bg-white text-surface-900 border border-surface-300',
  'button-outline': 'border border-surface-700 text-surface-900',
};

export default function TripCardPreview({ trip }: { trip: PreviewTrip }) {
  const cover = trip.media.find(item => item.type !== 'video') ?? trip.media[0];
  const title = trip.headlineDisplay.trim() || trip.title.trim() || 'Nome da viagem';
  const schedule = trip.scheduleInfo.trim() || [trip.departureTime, trip.returnTime].filter(Boolean).join(' às ') || (trip.scheduleTBD ? 'Horário a confirmar' : 'Horário não informado');
  const departure = trip.meetingTBD ? 'Embarque a confirmar' : [trip.meetingCity, trip.meetingPoint].filter(Boolean).join(' · ') || 'Embarque não informado';
  const price = trip.free ? 'Gratuito' : trip.priceDisplay.trim() || (trip.priceValue ? formatBRL(trip.priceValue) : 'Consulte');

  return (
    <aside className="rounded-xl border border-surface-200 bg-surface-50 p-4" aria-label="Prévia do card no site">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div><h3 className="font-semibold text-surface-900">Prévia do card</h3><p className="text-sm text-surface-600">Como a viagem aparecerá no site.</p></div>
        <span className="badge badge-info">Rascunho</span>
      </div>
      <article className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-surface-200">
        <div className="aspect-[16/9] bg-surface-200">
          {cover ? <img src={cover.src} alt={cover.alt || title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-surface-600">A capa aparecerá aqui</div>}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{trip.category.trim() || 'Viagem'}</p>
          <h4 className="text-lg font-semibold text-surface-900">{title}</h4>
          <p className="line-clamp-2 text-sm text-surface-700">{trip.description.trim() || 'O resumo da experiência aparecerá aqui.'}</p>
          <div className="space-y-2 text-sm text-surface-700">
            <p className="flex gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />{formatDateBR(trip.startDateISO)}</p>
            <p className="flex gap-2"><Clock3 className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />{schedule}</p>
            <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />{departure}</p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-surface-200 pt-3">
            <div><p className="text-lg font-bold text-surface-900">{price}</p>{!trip.free && <p className="text-xs text-surface-600">{trip.priceUnit || 'por pessoa'}</p>}</div>
            <span className={`rounded-lg px-3 py-2 text-sm font-semibold ${buttonClass[trip.buttonClass] || buttonClass['button-dark']}`}>{trip.buttonLabel || 'Quero viajar'}</span>
          </div>
        </div>
      </article>
    </aside>
  );
}
