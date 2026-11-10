import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { tripApi, settingsApi, TripFormData } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../App';
import { CityAutocomplete, UfSelect } from '../components/LocationFields';
import { nextCityOnRegionChange } from '../lib/locationCombobox';
import { isValidImageSrc, IMAGE_SRC_MESSAGE, hasRequiredAlt, UPLOADED_ALT_MESSAGE } from '../lib/imageSrc';
import { isoToLocalInput } from '../lib/dateInput';
import { fieldsToSchedule, scheduleToFields, type StoredSchedule } from '../lib/tripSchedule';
import { prepareTripTemplate } from '../lib/tripTemplate';
import { customItems, hasItem, INCLUDE_PRESETS, mergeUnique, togglePreset } from '../lib/includesServices';
import { fillMissingAlt, formatBRL, syncPriceDisplay } from '../lib/formHelpers';
import { canChangeTripStatus } from '../lib/permissions';
import { applyTripDefaults, countFilled, formatPriceInput, parsePriceInput, parseWholeNumber, publishProblems, TRIP_STATUS_LABELS, validateTripMinimum } from '../lib/panelHelpers';
import Button from '../components/Button';
import Field from '../components/Field';
import FormSection from '../components/FormSection';
import ConfirmDialog from '../components/ConfirmDialog';
import AiDraftBlock from '../components/AiDraftBlock';
import TripDocuments from '../components/TripDocuments';
import PublicationReadinessPanel from '../components/PublicationReadinessPanel';
import TripCardPreview from '../components/TripCardPreview';
import TripProposalPreview from '../components/TripProposalPreview';
import { applySuggestions, type DraftKey, type TripDraft } from '../lib/aiDraft';
import { ArrayInput, DeparturesInput, MediaInput } from '../components/TripFormInputs';

const intensityOptions = ['leve', 'moderado', 'intenso', 'extremo'] as const;

// Campo com problema -> id do campo na tela (para levar o foco até ele).
const ERROR_TARGETS: Record<string, string> = {
  title: 'title',
  region: 'region',
  city: 'city',
  startDateISO: 'startDateISO',
  priceValue: 'priceValue',
  media: 'media-link',
  description: 'description',
  departure: 'meetingTBD',
};
const ERROR_LABELS: Record<string, string> = {
  title: 'Nome da viagem',
  region: 'Estado',
  city: 'Cidade',
  startDateISO: 'Data de saída',
  priceValue: 'Valor',
  media: 'Fotos',
  description: 'Resumo',
  departure: 'Embarque',
};

// Todos os campos existem sempre no formulário (texto vazio, lista vazia); só valor e vagas podem ser "nenhum".
type AllRequired = { [K in keyof Required<TripFormData>]: NonNullable<Required<TripFormData>[K]> };
type FormState = Omit<AllRequired, 'priceValue' | 'spotsLeft'> & { priceValue: number | null; spotsLeft: number | null };

const emptyForm = (): FormState => ({
  title: '', headlineDisplay: '', category: '', filterCategory: '', description: '', city: '', region: '',
  startDateISO: isoToLocalInput(new Date().toISOString()).slice(0, 10), endDateISO: '',
  departureTime: '', departureTolerance: '', returnTime: '', scheduleInfo: '', scheduleTBD: false,
  priceValue: null, priceDisplay: '', priceUnit: 'por pessoa', free: false,
  intensityClass: 'moderado', spotsLeft: null, trailDistance: '', supportPoint: '', supportPointInfo: '',
  meetingCity: '', meetingPoint: '', meetingTBD: false, meetingDetails: '', meetingMapsQuery: '',
  includes: [], includesHighlight: '', includedServices: [], itinerary: [], routeNotes: [], importantInfo: [],
  media: [], buttonLabel: 'Quero viajar', buttonClass: 'button-dark', status: 'DRAFT',
  availabilitySchema: 'https://schema.org/InStock', departures: [],
});

export default function TripForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const templateId = !id ? searchParams.get('modelo') : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditStatus = canChangeTripStatus(user?.role);
  const isEditing = !!id;
  const [loading, setLoading] = useState(isEditing || !!templateId);
  const [saving, setSaving] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [pendingItems, setPendingItems] = useState<Record<string, boolean>>({});
  const setPendingItem = (field: string, pending: boolean) => setPendingItems(previous => previous[field] === pending ? previous : { ...previous, [field]: pending });
  const hasPendingItems = Object.values(pendingItems).some(Boolean);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [priceText, setPriceText] = useState('');
  // Datas como vieram da API: se a pessoa não mexe na data, o valor guardado não muda.
  const originalSchedule = useRef<StoredSchedule>({ startDateISO: null, departureTime: null, endDateISO: null, returnTime: null });
  const initialRef = useRef(JSON.stringify(formData));
  const summaryRef = useRef<HTMLDivElement>(null);

  // Valores do formulário novo: contam como "vazio" para a IA não pedir confirmação à toa.
  const defaultsRef = useRef<Record<string, unknown>>(isEditing ? {} : { ...emptyForm() });

  const applyAiDraft = (draft: TripDraft, chosen: DraftKey[], overwrite: DraftKey[]) => {
    const next = applySuggestions(formData as Record<string, unknown>, draft, chosen, overwrite, defaultsRef.current) as FormState;
    if (next.priceValue !== formData.priceValue) {
      next.priceDisplay = syncPriceDisplay(formData.priceValue, next.priceValue, formData.priceDisplay || '');
      setPriceText(formatPriceInput(next.priceValue));
    }
    const schedule = scheduleToFields({
      startDateISO: String(next.startDateISO ?? ''),
      departureTime: String(next.departureTime ?? ''),
      endDateISO: String(next.endDateISO ?? ''),
      returnTime: String(next.returnTime ?? ''),
    });
    next.startDateISO = schedule.startDate;
    next.departureTime = schedule.startTime;
    next.endDateISO = schedule.endDate;
    next.returnTime = schedule.endTime;
    next.includes = mergeUnique(next.includes, next.includedServices);
    next.includedServices = [];
    setFormData(next);
    toast.success('Campos preenchidos. Revise e clique em Salvar.');
  };

  const dirty = JSON.stringify(formData) !== initialRef.current || hasPendingItems || photoPending;

  // Avisa antes de fechar a aba com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const loadTrip = async (sourceId: string, useAsTemplate: boolean) => {
    try {
      const trip = await tripApi.get(sourceId);
      const schedule = scheduleToFields({ startDateISO: trip.startDateISO, departureTime: trip.departureTime, endDateISO: trip.endDateISO, returnTime: trip.returnTime });
      const loaded: FormState = {
        title: trip.title,
        headlineDisplay: trip.headlineDisplay || '',
        category: trip.category,
        filterCategory: trip.filterCategory || '',
        description: trip.description,
        city: trip.city,
        region: trip.region,
        startDateISO: schedule.startDate,
        departureTime: schedule.startTime,
        endDateISO: schedule.endDate,
        returnTime: schedule.endTime,
        departureTolerance: trip.departureTolerance || '',
        scheduleInfo: trip.scheduleInfo || '',
        scheduleTBD: trip.scheduleTBD,
        priceValue: trip.priceValue,
        priceDisplay: trip.priceDisplay || '',
        priceUnit: trip.priceUnit,
        free: trip.free,
        intensityClass: trip.intensityClass as FormState['intensityClass'],
        spotsLeft: trip.spotsLeft,
        trailDistance: trip.trailDistance || '',
        supportPoint: trip.supportPoint || '',
        supportPointInfo: trip.supportPointInfo || '',
        meetingCity: trip.meetingCity || '',
        meetingPoint: trip.meetingPoint || '',
        meetingTBD: trip.meetingTBD,
        meetingDetails: trip.meetingDetails || '',
        meetingMapsQuery: trip.meetingMapsQuery || '',
        includes: mergeUnique(trip.includes, trip.includedServices || []),
        includesHighlight: trip.includesHighlight || '',
        includedServices: [],
        itinerary: trip.itinerary || [],
        routeNotes: trip.routeNotes || [],
        importantInfo: trip.importantInfo || [],
        media: trip.media,
        buttonLabel: trip.buttonLabel,
        buttonClass: trip.buttonClass,
        status: trip.status,
        availabilitySchema: trip.availabilitySchema,
        departures: trip.departures?.map(d => ({
          time: d.time,
          place: d.place,
          city: d.city,
          mapsUrl: d.mapsUrl || undefined,
          mapsQuery: d.mapsQuery || undefined,
          orderIndex: d.orderIndex,
        })) || [],
      };
      const next = useAsTemplate ? prepareTripTemplate(loaded) : loaded;
      initialRef.current = useAsTemplate ? JSON.stringify(emptyForm()) : JSON.stringify(next);
      originalSchedule.current = useAsTemplate ? { startDateISO: null, departureTime: null, endDateISO: null, returnTime: null } : { startDateISO: trip.startDateISO, departureTime: trip.departureTime, endDateISO: trip.endDateISO, returnTime: trip.returnTime };
      setPriceText(formatPriceInput(next.priceValue));
      setFormData(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir a viagem.');
      navigate('/trips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id || templateId) {
      setLoading(true);
      void loadTrip(id || templateId!, !id);
    }
    else {
      settingsApi.getTripPresentation()
        .then((defaults) => {
          setFormData(prev => ({ ...prev, ...defaults }));
          defaultsRef.current = { ...defaultsRef.current, ...defaults };
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }
  }, [id, templateId]);

  const clearError = (name: string) => setErrors(prev => (prev[name] ? { ...prev, [name]: '' } : prev));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: value ? parseFloat(value) : null }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    clearError(name);
  };

  // Valor: aceita vírgula (109,99 / 1.250,00). O texto digitado fica à parte para não "comer" a vírgula.
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setPriceText(text);
    const num = parsePriceInput(text);
    setFormData(prev => ({ ...prev, priceValue: num, priceDisplay: syncPriceDisplay(prev.priceValue, num, prev.priceDisplay || '') }));
    clearError('priceValue');
  };

  const setList = (field: 'includes' | 'includedServices' | 'itinerary' | 'routeNotes' | 'importantInfo', value: string[]) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const validate = () => {
    const newErrors = validateTripMinimum(formData);
    if (formData.media.some(m => !isValidImageSrc(m.src))) newErrors.media = IMAGE_SRC_MESSAGE;
    else if (!formData.media.every(hasRequiredAlt)) newErrors.media = UPLOADED_ALT_MESSAGE;
    if (priceText.trim() && parsePriceInput(priceText) === null && !formData.free) newErrors.priceValue = 'Não entendi o valor. Use números, como 109,99 ou 1.250,00.';
    setErrors(newErrors);
    const keys = Object.keys(newErrors);
    if (keys.length > 0) {
      // Leva a pessoa até o primeiro problema.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        document.getElementById(ERROR_TARGETS[keys[0]])?.focus({ preventScroll: true });
      });
    }
    return keys.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photoPending) { toast.error('Conclua ou descarte o envio da foto antes de salvar.'); return; }
    if (hasPendingItems) { toast.error('Adicione ou apague os itens que ainda estão sendo preenchidos antes de salvar.'); return; }
    if (!validate()) return;

    setSaving(true);
    try {
      const withDefaults = applyTripDefaults(formData);
      const schedule = fieldsToSchedule({
        startDate: formData.startDateISO,
        startTime: formData.departureTime,
        endDate: formData.endDateISO,
        endTime: formData.returnTime,
      }, originalSchedule.current);
      const payload = {
        ...withDefaults,
        media: fillMissingAlt(formData.media, formData.title).map(m => ({ ...m, focus: m.focus?.trim() || undefined })),
        priceDisplay: formData.priceDisplay || (formData.priceValue && formData.priceValue > 0 && !formData.free ? formatBRL(formData.priceValue) : ''),
        ...schedule,
        startDateISO: schedule.startDateISO!,
        includedServices: [],
        ...(templateId ? { status: 'DRAFT' as const } : {}),
      };
      if (isEditing) {
        await tripApi.update(id!, payload);
        toast.success('Alterações salvas.');
      } else {
        await tripApi.create(payload);
        toast.success('Viagem criada como rascunho. Publique quando estiver pronta.');
      }
      initialRef.current = JSON.stringify(formData);
      navigate('/trips');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar a viagem.');
    } finally {
      setSaving(false);
    }
  };

  const leave = () => (dirty ? setLeaveOpen(true) : navigate('/trips'));

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4" aria-busy="true" aria-label="Carregando viagem">
        <div className="loading-skeleton h-10 w-1/2" />
        <div className="loading-skeleton h-96 w-full" />
      </div>
    );
  }

  const errorKeys = Object.keys(errors).filter(k => errors[k]);
  const f = formData;
  const publicationPending = publishProblems(f);
  const err = (name: string) => errors[name] || undefined;
  const invalid = (name: string) => (errors[name] ? 'input-error' : '');

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button type="button" onClick={leave} className="btn-icon" aria-label="Voltar para a lista de viagens">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h1 className="page-title">{isEditing ? 'Editar viagem' : templateId ? 'Nova viagem a partir de modelo' : 'Nova viagem'}</h1>
          <p className="page-description">{isEditing ? 'Edite os dados da viagem e salve as alterações.' : 'Comece pelos dados básicos. Você pode salvar e completar a publicação depois.'}</p>
        </div>
      </div>

      {isEditing && <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold text-surface-900">Reutilizar esta viagem</p><p className="text-sm text-surface-600">Crie uma nova viagem como rascunho e escolha outra data. A original permanece salva.</p></div>
        <Button onClick={() => { if (dirty) { toast.error('Salve as alterações antes de usar esta viagem como modelo.'); return; } navigate(`/trips/new?modelo=${encodeURIComponent(id!)}`); }}>Usar como modelo</Button>
      </div>}
      {templateId && <p className="alert-info" role="note">Os dados da viagem anterior foram copiados. Informe a nova data e revise os textos, horários, preços, embarques e fotos, que podem conter informações antigas. Ao salvar, será criado um novo rascunho; a viagem original não será alterada.</p>}

      <div className="card p-4 text-sm text-surface-700">
        <p className="font-semibold text-surface-900">Um cadastro para sua viagem</p>
        <p className="mt-1">Preencha o que já souber e salve como rascunho. Para publicar, complete os itens indicados abaixo.</p>
        <p className="mt-1">As ferramentas de IA e documentos, quando disponíveis, são opcionais e ajudam a preencher este cadastro.</p>
      </div>

      <div className="space-y-4">
        {id && user?.role === 'admin' && <details className="card p-4"><summary className="cursor-pointer font-semibold text-surface-900">Usar documento PDF (opcional)</summary><div className="mt-4"><TripDocuments key={id} tripId={id} form={formData as Record<string, unknown>} defaults={defaultsRef.current} onApply={applyAiDraft} /></div></details>}
        <AiDraftBlock form={formData as Record<string, unknown>} defaults={defaultsRef.current} onApply={applyAiDraft} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] xl:items-start">
      <details className="xl:hidden card p-4"><summary className="cursor-pointer font-semibold text-surface-900">Ver prévia da viagem</summary><div className="mt-4"><TripCardPreview trip={f} /></div></details>
      <form id="trip-form" onSubmit={handleSubmit} noValidate className="space-y-4 min-w-0">
        {errorKeys.length > 0 && (
          <div ref={summaryRef} className="alert-error" role="alert">
            <p className="font-semibold">Falta pouco para salvar:</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {errorKeys.map(k => (
                <li key={k}>
                  <a href={`#${ERROR_TARGETS[k]}`} className="underline" onClick={(e) => { e.preventDefault(); document.getElementById(ERROR_TARGETS[k])?.focus(); }}>
                    {ERROR_LABELS[k]}
                  </a>: {errors[k]}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Um formulário principal para salvar e preparar a publicação. */}
        <fieldset className="card p-5 space-y-5">
          <legend className="sr-only">Dados da viagem</legend>
          <h2 className="text-lg font-semibold text-surface-900">Dados da viagem</h2>
          <p className="text-sm text-surface-600">Para salvar um rascunho, informe nome, destino e data. Os demais dados desta seção são necessários para publicar.</p>

          <Field id="title" label="Nome da viagem" required error={err('title')}>
            <input id="title" name="title" className={`input ${invalid('title')}`} value={f.title} onChange={handleChange} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} placeholder="Ex.: Trilha do Pico do Jabre" autoComplete="off" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="region" label="Estado" required error={err('region')}>
              <UfSelect
                id="region"
                name="region"
                className={`select ${invalid('region')}`}
                value={f.region}
                onChange={(val, previousIsKnownUf) => {
                  setFormData(prev => ({ ...prev, region: val, city: nextCityOnRegionChange(prev.city, prev.region, val, previousIsKnownUf) }));
                  clearError('region');
                }}
              />
            </Field>
            <Field id="city" label="Cidade" required error={err('city')} hint="Escolha o estado primeiro.">
              <CityAutocomplete
                id="city"
                name="city"
                className={`input ${invalid('city')}`}
                value={f.city}
                uf={f.region}
                onChange={(val) => { setFormData(prev => ({ ...prev, city: val })); clearError('city'); }}
              />
            </Field>
          </div>

          <Field id="startDateISO" label="Data de saída" required error={err('startDateISO')}>
            <input id="startDateISO" name="startDateISO" type="date" className={`input ${invalid('startDateISO')}`} value={f.startDateISO} onChange={handleChange} aria-invalid={!!errors.startDateISO} />
          </Field>
          <Field id="description" label="Resumo da experiência" required={f.status === 'OPEN'} error={err('description')} hint="Necessário para publicar. Descreva o que os viajantes vão viver.">
            <textarea id="description" name="description" className={`input ${invalid('description')}`} value={f.description} onChange={handleChange} rows={4} aria-invalid={!!errors.description} placeholder="Conte o que torna essa viagem especial..." />
          </Field>

          <div className="form-group">
            <span className="label" id="media-label">Fotos da viagem</span>
            <p className="hint mb-2">A primeira foto é a capa. Precisa de pelo menos uma para publicar.</p>
            <MediaInput
              inputId="media-link"
              value={f.media}
              onPendingChange={setPhotoPending}
              onLinkPendingChange={(pending) => setPendingItem('foto', pending)}
              onChange={(val) => { setFormData(prev => ({ ...prev, media: val })); clearError('media'); }}
            />
            {errors.media && <p className="field-error" role="alert">{errors.media}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Field id="priceValue" label="Valor (R$)" required={f.status === 'OPEN' && !f.free} error={err('priceValue')} hint={f.free ? 'Viagem gratuita: sem valor.' : 'Necessário para publicar. Ex.: 109,99 ou 1.250,00'}>
                <input id="priceValue" name="priceValue" type="text" inputMode="decimal" className={`input ${invalid('priceValue')}`} value={priceText} onChange={handlePriceChange} placeholder="109,99" disabled={f.free} aria-invalid={!!errors.priceValue} autoComplete="off" />
              </Field>
              <label htmlFor="free" className="checkbox-label mt-2 min-h-[32px]">
                <input id="free" name="free" type="checkbox" className="checkbox-input" checked={f.free} onChange={(e) => { handleChange(e); clearError('priceValue'); }} />
                <span className="text-sm text-surface-700">Viagem gratuita</span>
              </label>
            </div>
          </div>

          <div>
            <span className="label">Embarque</span>
            <p className="hint mb-3">Para um único embarque, preencha cidade e local. Se ainda não sabe, marque "a confirmar".</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="meetingCity" label="Cidade de embarque">
                <input id="meetingCity" name="meetingCity" className="input" value={f.meetingCity} onChange={handleChange} placeholder="Ex.: Campina Grande" />
              </Field>
              <Field id="meetingPoint" label="Local de embarque">
                <input id="meetingPoint" name="meetingPoint" className="input" value={f.meetingPoint} onChange={handleChange} placeholder="Ex.: Praça da Bandeira" />
              </Field>
            </div>
            <label htmlFor="meetingTBD" className="checkbox-label min-h-[32px] mt-3">
              <input id="meetingTBD" name="meetingTBD" type="checkbox" className="checkbox-input" checked={f.meetingTBD} onChange={(e) => { handleChange(e); clearError('departure'); }} />
              <span className="text-sm text-surface-700">Embarque ainda está a confirmar</span>
            </label>
            {f.meetingTBD && <p className="hint">Enquanto estiver a confirmar, os pontos cadastrados não aparecerão no site.</p>}
            <details className="mt-3" open={f.departures.length > 0 || !!errors.departure || undefined}>
              <summary className="cursor-pointer font-semibold text-sm">Informar todos os pontos de embarque</summary>
              <div className="mt-3 space-y-2">
                <p className="hint">Ao usar esta lista, somente os pontos abaixo aparecem no site. Inclua todos os embarques, inclusive o primeiro, com horário, local e cidade.</p>
                <DeparturesInput value={f.departures} onPendingChange={(pending) => setPendingItem('embarque', pending)} onChange={(val) => setFormData(prev => ({ ...prev, departures: val }))} />
              </div>
            </details>
            {errors.departure && <p className="field-error" role="alert">{errors.departure}</p>}
          </div>

          <PublicationReadinessPanel problems={publicationPending} />
          {canEditStatus && !templateId && (
            <div>
              <Field id="status" label="Situação" hint={'“Publicada” aparece no site; “Rascunho” fica só aqui.'}>
                <select id="status" name="status" className="select" value={f.status} onChange={handleChange}>
                  {Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>
          )}
        </fieldset>

        {/* SEÇÃO 3: Detalhes para viajantes */}
        <FormSection title="Detalhes opcionais" summary="Horários, roteiro, o que inclui e outros detalhes" filled={countFilled([f.category, f.intensityClass !== 'moderado', f.spotsLeft, f.departureTime, f.endDateISO, f.returnTime, f.includes])}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="filterCategory" label="Categoria para o filtro" hint="Escolha um nome curto, como Trilha ou Praia. Se vazia, a viagem aparecerá apenas em Todas as categorias.">
              <input id="filterCategory" name="filterCategory" className="input" value={f.filterCategory} onChange={handleChange} maxLength={80} placeholder="Ex.: Trilha" />
            </Field>
            <Field id="category" label="Chamada sobre a foto" hint="Texto exibido no card. Não altera a categoria do filtro.">
              <input id="category" name="category" className="input" value={f.category} onChange={handleChange} placeholder="Ex.: Trilha, natureza e patrimônio" />
            </Field>
            <Field id="intensityClass" label="Intensidade">
              <select id="intensityClass" name="intensityClass" className="select" value={f.intensityClass} onChange={handleChange}>
                {intensityOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
              </select>
            </Field>
            <Field id="spotsLeft" label="Vagas restantes" hint="Só número inteiro. Aparece no site quando for maior que zero.">
              <input id="spotsLeft" name="spotsLeft" type="text" inputMode="numeric" pattern="[0-9]*" className="input" value={f.spotsLeft ?? ''} onChange={(e) => setFormData(prev => ({ ...prev, spotsLeft: parseWholeNumber(e.target.value) }))} autoComplete="off" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="departureTime" label="Horário de saída">
              <input id="departureTime" name="departureTime" type="time" className="input" value={f.departureTime} onChange={handleChange} />
            </Field>
            <Field id="endDateISO" label="Data de volta">
              <input id="endDateISO" name="endDateISO" type="date" className="input" value={f.endDateISO} onChange={handleChange} />
            </Field>
            <Field id="returnTime" label="Horário de volta">
              <input id="returnTime" name="returnTime" type="time" className="input" value={f.returnTime} onChange={handleChange} />
            </Field>
          </div>

          <Field id="includes-custom-input" label="O que inclui">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3" role="group" aria-label="Serviços padrão incluídos">
              {INCLUDE_PRESETS.map((item) => (
                <label key={item} className="checkbox-label min-h-[40px] rounded-lg border border-surface-200 px-3">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={hasItem(f.includes, item)}
                    onChange={() => setList('includes', togglePreset(f.includes, item))}
                  />
                  <span className="text-sm text-surface-800">{item}</span>
                </label>
              ))}
            </div>
            <ArrayInput
              id="includes-custom-input"
              value={customItems(f.includes)}
              onPendingChange={(pending) => setPendingItem('inclui', pending)}
              onChange={(items) => setList('includes', mergeUnique(INCLUDE_PRESETS.filter(item => hasItem(f.includes, item)), items))}
              placeholder="Ex.: Banho de rio, almoço"
            />
          </Field>

          <Field id="itinerary-input" label="Roteiro">
            <ArrayInput id="itinerary-input" value={f.itinerary} onPendingChange={(pending) => setPendingItem('roteiro', pending)} onChange={(val) => setList('itinerary', val)} placeholder="Ex.: 06h - Encontro, 07h - Saída" />
          </Field>
          <Field id="route-notes-input" label="Observações do percurso">
            <ArrayInput id="route-notes-input" value={f.routeNotes} onPendingChange={(pending) => setPendingItem('percurso', pending)} onChange={(val) => setList('routeNotes', val)} placeholder="Ex.: Trilha com trechos íngremes" />
          </Field>
          <Field id="important-info-input" label="Informações importantes">
            <ArrayInput id="important-info-input" value={f.importantInfo} onPendingChange={(pending) => setPendingItem('informações', pending)} onChange={(val) => setList('importantInfo', val)} placeholder="Ex.: Levar 2 litros de água" />
          </Field>
        <details className="form-section">
          <summary className="cursor-pointer font-semibold">Mais opções</summary>
          <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="headlineDisplay" label="Título alternativo (opcional)" hint="Pode ser usado em outros canais. O card do site usa o nome da viagem.">
              <input id="headlineDisplay" name="headlineDisplay" className="input" value={f.headlineDisplay} onChange={handleChange} />
            </Field>
            <Field id="priceDisplay" label="Texto do preço" hint="Acompanha o Valor sozinho. Se você escrever um texto próprio, ele não muda mais.">
              <input id="priceDisplay" name="priceDisplay" className="input" value={f.priceDisplay} onChange={handleChange} placeholder="R$ 109,99" disabled={f.free} />
            </Field>
            <Field id="departureTolerance" label="Tolerância de espera por atrasados">
              <input id="departureTolerance" name="departureTolerance" className="input" value={f.departureTolerance} onChange={handleChange} placeholder="30 minutos" />
            </Field>
          </div>
          <Field id="scheduleInfo" label="Horário em texto livre" hint="Se preenchido, aparece no card no lugar de saída e volta.">
            <input id="scheduleInfo" name="scheduleInfo" className="input" value={f.scheduleInfo} onChange={handleChange} placeholder="06h às 18h" />
          </Field>
          <label htmlFor="scheduleTBD" className="checkbox-label min-h-[32px]">
            <input id="scheduleTBD" name="scheduleTBD" type="checkbox" className="checkbox-input" checked={f.scheduleTBD} onChange={handleChange} />
            <span className="text-sm text-surface-700">Horário ainda não definido</span>
          </label>
          <Field id="trailDistance" label="Distância da trilha">
            <input id="trailDistance" name="trailDistance" className="input" value={f.trailDistance} onChange={handleChange} placeholder="aproximadamente 6 km" />
          </Field>
          <Field id="supportPoint" label="Ponto de apoio">
            <input id="supportPoint" name="supportPoint" className="input" value={f.supportPoint} onChange={handleChange} />
          </Field>
          <Field id="supportPointInfo" label="Informações do ponto de apoio">
            <textarea id="supportPointInfo" name="supportPointInfo" className="input" value={f.supportPointInfo} onChange={handleChange} rows={2} />
          </Field>
          <Field id="includesHighlight" label="Frase de destaque do que inclui">
            <input id="includesHighlight" name="includesHighlight" className="input" value={f.includesHighlight} onChange={handleChange} placeholder="Transporte incluso saindo de João Pessoa" />
          </Field>
          <Field id="meetingDetails" label="Detalhes do embarque">
            <textarea id="meetingDetails" name="meetingDetails" className="input" value={f.meetingDetails} onChange={handleChange} rows={2} />
          </Field>
          <Field id="meetingMapsQuery" label="Endereço para o mapa (Google Maps)" hint="Se preenchido, o local no card vira um link que abre o Google Maps.">
            <input id="meetingMapsQuery" name="meetingMapsQuery" className="input" value={f.meetingMapsQuery} onChange={handleChange} placeholder="Rua Exemplo, 123 - Bairro, Cidade/UF" />
          </Field>
          </div>
        </details>
        </FormSection>

        <div className="fixed bottom-0 inset-x-0 lg:left-64 z-20 bg-white/95 backdrop-blur border-t border-surface-200">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <p className={`${photoPending || hasPendingItems ? '' : 'hidden sm:block'} text-sm text-surface-600`} aria-live="polite">
              {photoPending ? 'Conclua ou descarte a foto antes de salvar.' : hasPendingItems ? 'Adicione ou apague os itens em preenchimento antes de salvar.' : dirty ? 'Você tem alterações não salvas.' : isEditing ? 'Nenhuma alteração.' : 'Será salva como rascunho.'}
            </p>
            <div className="flex gap-3 w-full sm:w-auto">
              <Button onClick={leave} disabled={saving} className="flex-1 sm:flex-none">Cancelar</Button>
              <Button type="submit" variant="primary" disabled={photoPending} loading={saving} loadingText="Salvando..." icon={<Save className="w-5 h-5" aria-hidden="true" />} className="flex-1 sm:flex-none">
                {isEditing ? 'Salvar alterações' : 'Salvar viagem'}
              </Button>
            </div>
          </div>
        </div>
      </form>
      <div className="hidden xl:block xl:sticky xl:top-6"><TripCardPreview trip={f} /></div>
      </div>

      <div className="space-y-4">
        {id && <TripProposalPreview trip={formData} dirty={dirty} />}
      </div>

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Sair sem salvar?"
        description="Você mudou algo nesta viagem e ainda não salvou. Se sair agora, essas mudanças se perdem."
        confirmLabel="Sair sem salvar"
        onConfirm={() => navigate('/trips')}
      />
    </div>
  );
}
