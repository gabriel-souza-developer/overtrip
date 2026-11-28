import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Save } from 'lucide-react';
import { tripApi, tripTemplateApi, settingsApi, documentApi, TripFormData } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../App';
import { CityAutocomplete, UfSelect } from '../components/LocationFields';
import { nextCityOnRegionChange } from '../lib/locationCombobox';
import { isValidTripMediaSrc, IMAGE_SRC_MESSAGE, hasRequiredAlt, UPLOADED_ALT_MESSAGE } from '../lib/imageSrc';
import { isoToLocalInput } from '../lib/dateInput';
import { fieldsToScheduleWithText, scheduleText, scheduleToFields, type StoredSchedule } from '../lib/tripSchedule';
import { prepareTripTemplate } from '../lib/tripTemplate';
import { customItems, hasItem, INCLUDE_PRESETS, mergeUnique, togglePreset } from '../lib/includesServices';
import { customImportantInfo, DEFAULT_IMPORTANT_INFO, DEPARTURE_PRESETS, type DeparturePreset, FILTER_CATEGORY_OPTIONS, hasImportantInfoPreset, IMPORTANT_INFO_PRESETS, toggleImportantInfoPreset } from '../lib/tripFormOptions';
import { fillMissingAlt, formatBRL, syncPriceDisplay } from '../lib/formHelpers';
import { canChangeTripStatus } from '../lib/permissions';
import { applyTripDefaults, formatPriceInput, parsePriceInput, parseWholeNumber, TRIP_STATUS_LABELS, validateTripMinimum } from '../lib/panelHelpers';
import Button from '../components/Button';
import Field from '../components/Field';
import ConfirmDialog from '../components/ConfirmDialog';
import AiDraftBlock from '../components/AiDraftBlock';
import TripDocuments from '../components/TripDocuments';
import PublicationReadinessPanel from '../components/PublicationReadinessPanel';
import TripCardPreview from '../components/TripCardPreview';
import TripProposalPreview from '../components/TripProposalPreview';
import RowMenu from '../components/RowMenu';
import { applySuggestions, type DraftKey, type TripDraft } from '../lib/aiDraft';
import { ArrayInput, DeparturesInput, LocationPicker, MediaInput } from '../components/TripFormInputs';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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
  title: '', tripProfile: 'STANDARD', headlineDisplay: '', category: '', filterCategory: '', description: '', city: '', region: '',
  startDateISO: isoToLocalInput(new Date().toISOString()).slice(0, 10), endDateISO: '',
  departureTime: '', departureTolerance: '', returnTime: '', scheduleInfo: '', scheduleTBD: false,
  priceValue: null, priceDisplay: '', priceUnit: 'por pessoa', free: false,
  intensityClass: 'moderado', spotsLeft: null, trailDistance: '', supportPoint: '', supportPointInfo: '',
  meetingCity: '', meetingPoint: '', meetingTBD: false, meetingDetails: '', meetingMapsQuery: '', meetingLat: null, meetingLng: null,
  includes: [], includesHighlight: '', includedServices: [], itinerary: [], routeNotes: [], importantInfo: [...DEFAULT_IMPORTANT_INFO],
  media: [], buttonLabel: 'Quero viajar', buttonClass: 'button-dark', status: 'DRAFT',
  availabilitySchema: 'https://schema.org/InStock', departures: [],
});

export default function TripForm() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle(id ? 'Editar viagem' : 'Nova viagem');
  const [searchParams] = useSearchParams();
  const savedTemplateId = !id ? searchParams.get('modeloSalvo') : null;
  const templateId = !id ? searchParams.get('modelo') : null;
  const isTemplate = !!(savedTemplateId || templateId);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditStatus = canChangeTripStatus(user?.role);
  const isEditing = !!id;
  const [loading, setLoading] = useState(isEditing || isTemplate);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [draftDeleteOpen, setDraftDeleteOpen] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [pendingItems, setPendingItems] = useState<Record<string, boolean>>({});
  const setPendingItem = (field: string, pending: boolean) => setPendingItems(previous => previous[field] === pending ? previous : { ...previous, [field]: pending });
  const hasPendingItems = Object.values(pendingItems).some(Boolean);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [departureSeed, setDepartureSeed] = useState<{ place: string; city: string; mapsQuery: string; lat: number | null; lng: number | null; requestId: number } | null>(null);
  // Datas como vieram da API: se a pessoa não mexe na data, o valor guardado não muda.
  const originalSchedule = useRef<StoredSchedule>({ startDateISO: null, departureTime: null, endDateISO: null, returnTime: null });
  const originalScheduleText = useRef('');
  const initialRef = useRef(JSON.stringify(formData));
  const summaryRef = useRef<HTMLDivElement>(null);
  const departureMoreRef = useRef<HTMLDetailsElement>(null);

  // Valores do formulário novo: contam como "vazio" para a IA não pedir confirmação à toa.
  const defaultsRef = useRef<Record<string, unknown>>(isEditing ? {} : { ...emptyForm() });

  const applyAiDraft = (draft: TripDraft, chosen: DraftKey[], overwrite: DraftKey[]) => {
    const next = applySuggestions(formData as Record<string, unknown>, draft, chosen, overwrite, defaultsRef.current) as FormState;
    if (next.title) next.title = next.title.toLocaleUpperCase('pt-BR');
    if (['meetingCity', 'meetingPoint', 'meetingMapsQuery'].some(key => next[key] !== formData[key])) {
      next.meetingLat = null;
      next.meetingLng = null;
    }
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
    if (!next.scheduleInfo && (chosen.includes('departureTime') || chosen.includes('returnTime'))) {
      next.scheduleInfo = scheduleText({ startDateISO: null, departureTime: next.departureTime, endDateISO: null, returnTime: next.returnTime });
    }
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

  const fillLoadedForm = (next: FormState, schedule?: StoredSchedule) => {
    initialRef.current = JSON.stringify(schedule ? next : emptyForm());
    originalSchedule.current = schedule ?? { startDateISO: null, departureTime: null, endDateISO: null, returnTime: null };
    originalScheduleText.current = next.scheduleInfo;
    setPriceText(formatPriceInput(next.priceValue));
    setFormData(next);
  };

  const loadTrip = async (sourceId: string, useAsTemplate: boolean, isCurrent: () => boolean) => {
    try {
      const trip = await tripApi.get(sourceId);
      if (!isCurrent()) return;
      const schedule = scheduleToFields({ startDateISO: trip.startDateISO, departureTime: trip.departureTime, endDateISO: trip.endDateISO, returnTime: trip.returnTime });
      const loaded: FormState = {
        title: trip.title,
        tripProfile: trip.tripProfile ?? 'STANDARD',
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
        scheduleInfo: trip.scheduleInfo || scheduleText({ startDateISO: trip.startDateISO, departureTime: trip.departureTime, endDateISO: trip.endDateISO, returnTime: trip.returnTime }),
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
        meetingLat: trip.meetingLat,
        meetingLng: trip.meetingLng,
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
          lat: d.lat,
          lng: d.lng,
          orderIndex: d.orderIndex,
        })) || [],
      };
      if (useAsTemplate) fillLoadedForm(prepareTripTemplate(loaded));
      else fillLoadedForm(loaded, { startDateISO: trip.startDateISO, departureTime: trip.departureTime, endDateISO: trip.endDateISO, returnTime: trip.returnTime });
    } catch (err) {
      if (!isCurrent()) return;
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir a viagem.');
      navigate('/trips');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    let current = true;
    if (savedTemplateId) {
      setLoading(true);
      tripTemplateApi.get(savedTemplateId)
        .then(({ snapshot }) => {
          if (!current) return;
          const storedFields = Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value != null));
          const loaded = { ...emptyForm(), ...storedFields };
          loaded.includes = mergeUnique(loaded.includes, loaded.includedServices);
          loaded.includedServices = [];
          fillLoadedForm(prepareTripTemplate(loaded));
        })
        .catch((err) => {
          if (!current) return;
          toast.error(err instanceof Error ? err.message : 'Não foi possível abrir o modelo.');
          navigate('/trips');
        })
        .finally(() => { if (current) setLoading(false); });
    } else if (id || templateId) {
      setLoading(true);
      void loadTrip(id || templateId!, !id, () => current);
    } else {
      settingsApi.getTripPresentation()
        .then((defaults) => {
          if (!current) return;
          setFormData(prev => ({ ...prev, ...defaults }));
          defaultsRef.current = { ...defaultsRef.current, ...defaults };
        })
        .catch(() => undefined)
        .finally(() => { if (current) setLoading(false); });
    }
    return () => { current = false; };
  }, [id, savedTemplateId, templateId]);

  const clearError = (name: string) => setErrors(prev => (prev[name] ? { ...prev, [name]: '' } : prev));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const locationChanged = ['meetingCity', 'meetingPoint', 'meetingMapsQuery'].includes(name);
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: value ? parseFloat(value) : null }));
    } else {
      // Nome da viagem sempre em maiúsculas (ex.: "TRILHA EM LUCENA - PB"), igual ao padrão já usado.
      const normalized = name === 'title' ? value.toLocaleUpperCase('pt-BR') : value;
      setFormData(prev => ({ ...prev, [name]: normalized, ...(locationChanged ? { meetingLat: null, meetingLng: null } : {}) }));
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
    if (formData.media.some(m => !isValidTripMediaSrc(m.src))) newErrors.media = IMAGE_SRC_MESSAGE;
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
      const schedule = fieldsToScheduleWithText({
        startDate: formData.startDateISO,
        startTime: formData.departureTime,
        endDate: formData.endDateISO,
        endTime: formData.returnTime,
      }, originalSchedule.current, formData.scheduleInfo !== originalScheduleText.current);
      const payload = {
        ...withDefaults,
        media: fillMissingAlt(formData.media, formData.title).map(m => ({ ...m, focus: m.focus?.trim() || undefined })),
        priceDisplay: formData.priceDisplay || (formData.priceValue && formData.priceValue > 0 && !formData.free ? formatBRL(formData.priceValue) : ''),
        ...schedule,
        startDateISO: schedule.startDateISO!,
        includedServices: [],
        ...(isTemplate ? { status: 'DRAFT' as const } : {}),
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

  const applyDeparturePreset = (preset: DeparturePreset) => {
    setFormData(prev => ({
      ...prev,
      meetingCity: preset.city,
      meetingPoint: preset.point,
      meetingMapsQuery: preset.mapsQuery,
      meetingLat: null,
      meetingLng: null,
    }));
    clearError('departure');
    // Abre "Mais opções" pra já deixar a busca do mapa visível, pronta pra confirmar.
    if (departureMoreRef.current) departureMoreRef.current.open = true;
  };

  const useAsModel = () => {
    if (!id) return;
    if (dirty) { toast.error('Salve as alterações antes de reutilizar os dados desta viagem.'); return; }
    navigate(`/trips/new?modelo=${encodeURIComponent(id)}`);
  };

  const saveAsModel = async () => {
    if (!id) return;
    if (dirty) { toast.error('Salve as alterações na viagem antes de salvá-la como modelo.'); return; }
    setSavingTemplate(true);
    try {
      await tripTemplateApi.save(id, formData.title);
      if (formData.status === 'DRAFT') setDraftDeleteOpen(true);
      else toast.success('Modelo salvo.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o modelo.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const removeOriginalDraft = async () => {
    if (!id) return;
    setDeletingDraft(true);
    try {
      await tripApi.delete(id);
      toast.success('Rascunho excluído. Modelo mantido.');
      navigate('/trips');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir o rascunho.');
    } finally {
      setDeletingDraft(false);
    }
  };

  // Leva o foco até o campo que a pendência de publicação aponta (PublicationReadinessPanel).
  const focusPublicationField = (fieldId: string) => {
    const el = document.getElementById(fieldId);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };

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
  // Mesma validação do mínimo para publicar, mas já com o campo de cada pendência (para o foco do painel).
  const publicationIssues = Object.entries(validateTripMinimum({ ...f, status: 'OPEN' }))
    .map(([key, message]) => ({ message, field: ERROR_TARGETS[key] }));
  const err = (name: string) => errors[name] || undefined;
  const invalid = (name: string) => (errors[name] ? 'input-error' : '');
  const nestedBlockClass = 'rounded-lg border border-surface-200 p-4';
  const hasSiteTexts = !!f.headlineDisplay.trim() || (!!f.priceDisplay.trim() && f.priceDisplay.trim() !== (f.priceValue ? formatBRL(f.priceValue) : ''));
  const hasMapDetails = !!f.meetingMapsQuery.trim() || (f.meetingLat != null && f.meetingLng != null);
  const hasExtraPhrase = !!f.includesHighlight.trim();
  const hasTrailDetails = !!f.trailDistance.trim() || !!f.supportPoint.trim() || !!f.supportPointInfo.trim() || f.routeNotes.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={leave} className="btn-icon" aria-label="Voltar para a lista de viagens">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h1 className="page-title">{isEditing ? 'Editar viagem' : isTemplate ? 'Nova viagem a partir de modelo' : 'Nova viagem'}</h1>
        </div>
        </div>
        {isEditing && <RowMenu label="Mais opções da viagem" items={[
          { key: 'reuse', label: 'Usar como modelo', icon: <Copy className="w-4 h-4" aria-hidden="true" />, disabled: saving || savingTemplate, onSelect: useAsModel },
          { key: 'save-template', label: savingTemplate ? 'Salvando modelo…' : 'Salvar como modelo', icon: <Save className="w-4 h-4" aria-hidden="true" />, disabled: saving || savingTemplate, onSelect: () => { void saveAsModel(); } },
        ]} />}
      </div>

      {isTemplate && <p className="alert-info" role="note">Informe a nova data e revise os textos, preços, embarques e fotos antes de salvar a viagem como rascunho.</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] xl:items-start">
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

        {/* Bloco 0: atalhos para preencher o formulário sem digitar tudo manualmente. */}
        <details className="card p-5 space-y-4">
          <summary className="cursor-pointer text-lg font-semibold text-surface-900">Preencher automaticamente <span className="text-sm font-normal text-surface-500">(opcional)</span></summary>
          {user?.role === 'admin' && (
            <details className={nestedBlockClass}>
              <summary className="cursor-pointer font-semibold text-surface-900">Sugerir preenchimento com PDF e IA (opcional)</summary>
              <p className="hint mt-2">Envie o roteiro em PDF. A IA sugere informações e você escolhe o que aplicar.</p>
              {id
                ? <div className="mt-4"><TripDocuments key={id} tripId={id} api={documentApi} form={formData as Record<string, unknown>} defaults={defaultsRef.current} onApply={applyAiDraft} /></div>
                : <p className="mt-3 rounded-lg bg-surface-50 p-3 text-sm text-surface-700" role="note">Salve a viagem como rascunho primeiro. Depois, você poderá anexar o PDF aqui.</p>}
            </details>
          )}

          <AiDraftBlock form={formData as Record<string, unknown>} defaults={defaultsRef.current} onApply={applyAiDraft} showUnavailable />
        </details>

        {/* Bloco 1: o mínimo para a viagem existir e aparecer na lista/filtro. */}
        <fieldset className="card p-5 space-y-5">
          <legend className="sr-only">Informações principais</legend>
          <h2 className="text-lg font-semibold text-surface-900">Informações principais</h2>
          <Field id="title" label="Nome da viagem" required error={err('title')}>
            <input id="title" name="title" className={`input ${invalid('title')}`} value={f.title} onChange={handleChange} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} placeholder="Ex.: TRILHA DO PICO DO JABRE" autoComplete="off" />
          </Field>

          <Field id="tripProfile" label="Perfil da viagem">
            <select id="tripProfile" name="tripProfile" className="select" value={f.tripProfile} onChange={handleChange}>
              <option value="STANDARD">TRIP regular</option>
              <option value="OVER_RIDERS">OVER RIDERS</option>
            </select>
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
            <Field id="city" label="Cidade" required error={err('city')}>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="startDateISO" label="Data de saída" required error={err('startDateISO')}>
              <input id="startDateISO" name="startDateISO" type="date" className={`input ${invalid('startDateISO')}`} value={f.startDateISO} onChange={handleChange} aria-invalid={!!errors.startDateISO} />
            </Field>
            <Field id="endDateISO" label="Data de volta"><input id="endDateISO" name="endDateISO" type="date" className="input" value={f.endDateISO} onChange={handleChange} /></Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Field id="priceValue" label="Valor (R$)" required={f.status === 'OPEN' && !f.free} error={err('priceValue')}>
                <input id="priceValue" name="priceValue" type="text" inputMode="decimal" className={`input ${invalid('priceValue')}`} value={priceText} onChange={handlePriceChange} placeholder="109,99" disabled={f.free} aria-invalid={!!errors.priceValue} autoComplete="off" />
              </Field>
              <label htmlFor="free" className="checkbox-label mt-2 min-h-[32px]">
                <input id="free" name="free" type="checkbox" className="checkbox-input" checked={f.free} onChange={(e) => { handleChange(e); clearError('priceValue'); }} />
                <span className="text-sm text-surface-700">Viagem gratuita</span>
              </label>
            </div>
            <Field id="spotsLeft" label="Vagas restantes">
              <input id="spotsLeft" name="spotsLeft" type="text" inputMode="numeric" pattern="[0-9]*" className="input" value={f.spotsLeft ?? ''} onChange={(e) => setFormData(prev => ({ ...prev, spotsLeft: parseWholeNumber(e.target.value) }))} autoComplete="off" />
            </Field>
          </div>

          <Field id="filterCategory" label="Categoria da viagem" hint="Usada nos filtros do site.">
            <select id="filterCategory" name="filterCategory" className="select" value={f.filterCategory} onChange={handleChange}>
              <option value="">Selecione uma categoria</option>
              {f.filterCategory && !FILTER_CATEGORY_OPTIONS.some(option => option.toLocaleLowerCase('pt-BR') === f.filterCategory.trim().toLocaleLowerCase('pt-BR')) && <option value={f.filterCategory}>{f.filterCategory} (personalizada)</option>}
              {FILTER_CATEGORY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>

          <details className={nestedBlockClass}>
            <summary className="cursor-pointer text-sm font-semibold text-surface-700">Textos exibidos no site{hasSiteTexts && <span className="ml-2 font-normal text-surface-500">• preenchido</span>}</summary>
            <div className="pt-4 space-y-5">
              <Field id="headlineDisplay" label="Título para outros canais (opcional)" hint="O site continua usando o nome da viagem.">
                <input id="headlineDisplay" name="headlineDisplay" className="input" value={f.headlineDisplay} onChange={handleChange} />
              </Field>
              <Field id="priceDisplay" label="Texto do valor no site (opcional)" hint="Se preenchido, aparece no lugar do valor numérico.">
                <input id="priceDisplay" name="priceDisplay" className="input" value={f.priceDisplay} onChange={handleChange} placeholder="Ex.: A partir de R$ 109,99" disabled={f.free} />
              </Field>
            </div>
          </details>
        </fieldset>

        {/* Bloco 2: de onde e quando o grupo sai e volta. */}
        <fieldset className="card p-5 space-y-5">
          <legend className="sr-only">Embarque e horários</legend>
          <h2 className="text-lg font-semibold text-surface-900">Embarque e horários</h2>

          <Field id="scheduleInfo" label="Horário da viagem">
            <input id="scheduleInfo" name="scheduleInfo" className="input" value={f.scheduleInfo} onChange={handleChange} placeholder="Ex.: 05h às 17h" />
          </Field>
          <label htmlFor="scheduleTBD" className="checkbox-label min-h-[32px]"><input id="scheduleTBD" name="scheduleTBD" type="checkbox" className="checkbox-input" checked={f.scheduleTBD} onChange={handleChange} /><span className="text-sm text-surface-700">Horário ainda não definido</span></label>

          <div>
            <span className="label">Embarque</span>
            <p className="hint mb-3">Informe cidade e local. Se ainda não souber, marque “a confirmar”.</p>
            <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Embarques frequentes">
              {DEPARTURE_PRESETS.map(preset => (
                <button key={preset.label} type="button" className="btn-secondary btn-sm" onClick={() => applyDeparturePreset(preset)}>
                  {preset.label}
                </button>
              ))}
            </div>
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
              <summary className="cursor-pointer font-semibold text-sm">Adicionar vários pontos de embarque</summary>
              <div className="mt-3 space-y-2">
                <p className="hint">Com vários pontos, só esta lista aparece no site. Informe o horário de cada um.</p>
                {f.meetingCity.trim() && f.meetingPoint.trim() && !f.departures.some(point => point.city.trim().toLocaleLowerCase('pt-BR') === f.meetingCity.trim().toLocaleLowerCase('pt-BR') && point.place.trim().toLocaleLowerCase('pt-BR') === f.meetingPoint.trim().toLocaleLowerCase('pt-BR')) && (
                  <button type="button" className="btn-secondary btn-sm" disabled={!!pendingItems.embarque} onClick={() => setDepartureSeed({ city: f.meetingCity, place: f.meetingPoint, mapsQuery: f.meetingMapsQuery, lat: f.meetingLat, lng: f.meetingLng, requestId: Date.now() })}>
                    Usar embarque preenchido acima
                  </button>
                )}
                <DeparturesInput seed={departureSeed} value={f.departures} onPendingChange={(pending) => setPendingItem('embarque', pending)} onChange={(val) => setFormData(prev => ({ ...prev, departures: val }))} />
              </div>
            </details>
            <Field id="meetingDetails" label="Orientações de embarque (opcional)">
              <textarea id="meetingDetails" name="meetingDetails" className="input" value={f.meetingDetails} onChange={handleChange} rows={2} />
            </Field>
            {errors.departure && <p className="field-error" role="alert">{errors.departure}</p>}
          </div>

          <Field id="departureTolerance" label="Tolerância operacional no embarque">
            <input id="departureTolerance" name="departureTolerance" className="input" value={f.departureTolerance} onChange={handleChange} placeholder="30 minutos" />
          </Field>

          <details ref={departureMoreRef} className={nestedBlockClass}>
            <summary className="cursor-pointer text-sm font-semibold text-surface-700">Mapa do embarque{hasMapDetails && <span className="ml-2 font-normal text-surface-500">• preenchido</span>}</summary>
            <div className="pt-4 space-y-5">
              <Field id="meetingMapsQuery" label="Endereço para o mapa (opcional)" hint="Confirme o local sugerido antes de salvar.">
                <input id="meetingMapsQuery" name="meetingMapsQuery" className="input" value={f.meetingMapsQuery} onChange={handleChange} placeholder="Rua, bairro, cidade/UF" />
              </Field>
              <div className="form-group">
                <span className="label">Coordenadas confirmadas do embarque (opcional)</span>
                <p className="hint mb-2">A coordenada mostra o mapa no site e é removida se cidade, local ou endereço mudar.</p>
                <LocationPicker key={JSON.stringify([f.meetingCity, f.meetingPoint, f.meetingMapsQuery])} coords={f.meetingLat !== null && f.meetingLng !== null ? { lat: f.meetingLat, lng: f.meetingLng } : null} onConfirm={(result) => setFormData(prev => ({ ...prev, meetingLat: result.lat, meetingLng: result.lng }))} onClear={() => setFormData(prev => ({ ...prev, meetingLat: null, meetingLng: null }))} />
              </div>
            </div>
          </details>
        </fieldset>

        {/* Bloco 3: o que torna a viagem especial, do jeito que aparece na página. */}
        <fieldset className="card p-5 space-y-5">
          <legend className="sr-only">Como é a experiência</legend>
          <h2 className="text-lg font-semibold text-surface-900">Como é a experiência</h2>

          <Field id="description" label="Resumo da experiência" required={f.status === 'OPEN'} error={err('description')}>
            <textarea id="description" name="description" className={`input ${invalid('description')}`} value={f.description} onChange={handleChange} rows={4} aria-invalid={!!errors.description} placeholder="Conte o que torna essa viagem especial..." />
          </Field>

          <div className="form-group">
            <span className="label" id="media-label">Fotos da viagem</span>
            <p className="hint mb-2">A primeira imagem será a capa.</p>
            <MediaInput
              inputId="media-link"
              value={f.media}
              onPendingChange={setPhotoPending}
              onLinkPendingChange={(pending) => setPendingItem('foto', pending)}
              onChange={(val) => { setFormData(prev => ({ ...prev, media: val })); clearError('media'); }}
            />
            {errors.media && <p className="field-error" role="alert">{errors.media}</p>}
          </div>

          <Field id="category" label="Texto de destaque no card" hint="Exibido acima do nome da viagem.">
            <input id="category" name="category" className="input" value={f.category} onChange={handleChange} placeholder="Ex.: Trilha, natureza e patrimônio" />
          </Field>

          <Field id="intensityClass" label="Intensidade da atividade">
            <select id="intensityClass" name="intensityClass" className="select" value={f.intensityClass} onChange={handleChange}>
              {intensityOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
            </select>
          </Field>

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

          <details className={nestedBlockClass}>
            <summary className="cursor-pointer text-sm font-semibold text-surface-700">Frase extra (opcional){hasExtraPhrase && <span className="ml-2 font-normal text-surface-500">• preenchido</span>}</summary>
            <div className="pt-4 space-y-5">
              <Field id="includesHighlight" label="Frase de destaque" hint="Aparece abaixo de “O que inclui”."><input id="includesHighlight" name="includesHighlight" className="input" value={f.includesHighlight} onChange={handleChange} aria-describedby="includesHighlight-hint" placeholder="Ex.: Seguro viagem incluso" /></Field>
            </div>
          </details>
        </fieldset>

        {/* Bloco 4: roteiro, orientações e, quando for trilha, os detalhes do percurso. */}
        <fieldset className="card p-5 space-y-5">
          <legend className="sr-only">Roteiro e orientações</legend>
          <h2 className="text-lg font-semibold text-surface-900">Roteiro e orientações</h2>

          <Field id="itinerary-input" label="Roteiro">
            <ArrayInput id="itinerary-input" value={f.itinerary} onPendingChange={(pending) => setPendingItem('roteiro', pending)} onChange={(val) => setList('itinerary', val)} placeholder="Ex.: 06h - Encontro, 07h - Saída" />
          </Field>

          <Field id="important-info-input" label="Informações importantes">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4" role="group" aria-label="Orientações sugeridas">
              {IMPORTANT_INFO_PRESETS.map(item => <label key={item} className="checkbox-label min-h-[44px] items-start rounded-lg border border-surface-200 px-3 py-2.5 leading-snug">
                <input type="checkbox" className="checkbox-input mt-0.5" checked={hasImportantInfoPreset(f.importantInfo, item)} onChange={() => setList('importantInfo', toggleImportantInfoPreset(f.importantInfo, item))} />
                <span className="text-sm text-surface-800">{item}</span>
              </label>)}
            </div>
            <ArrayInput id="important-info-input" value={customImportantInfo(f.importantInfo)} onPendingChange={(pending) => setPendingItem('informações', pending)} onChange={(items) => setList('importantInfo', mergeUnique(IMPORTANT_INFO_PRESETS.filter(item => hasImportantInfoPreset(f.importantInfo, item)), items))} placeholder="Ex.: O pagamento final vence 48 horas antes" />
          </Field>

          <details className={nestedBlockClass}>
            <summary className="cursor-pointer text-sm font-semibold text-surface-700">Trilha (quando houver){hasTrailDetails && <span className="ml-2 font-normal text-surface-500">• preenchido</span>}</summary>
            <div className="pt-4 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="trailDistance" label="Distância do percurso"><input id="trailDistance" name="trailDistance" className="input" value={f.trailDistance} onChange={handleChange} placeholder="Ex.: aproximadamente 6 km" /></Field>
                <Field id="supportPoint" label="Ponto de apoio"><input id="supportPoint" name="supportPoint" className="input" value={f.supportPoint} onChange={handleChange} /></Field>
              </div>
              <Field id="supportPointInfo" label="Sobre o ponto de apoio"><textarea id="supportPointInfo" name="supportPointInfo" className="input" value={f.supportPointInfo} onChange={handleChange} rows={2} /></Field>
              <Field id="route-notes-input" label="Observações do percurso">
                <ArrayInput id="route-notes-input" value={f.routeNotes} onPendingChange={(pending) => setPendingItem('percurso', pending)} onChange={(val) => setList('routeNotes', val)} placeholder="Ex.: Trilha com trechos íngremes" />
              </Field>
            </div>
          </details>
        </fieldset>

        {/* Bloco 5: situação e o que falta para publicar, por último, ao lado do botão Salvar. */}
        <fieldset className="card p-5 space-y-5">
          <legend className="sr-only">Publicação</legend>
          <h2 className="text-lg font-semibold text-surface-900">Publicação</h2>

          <PublicationReadinessPanel problems={publicationIssues} onFieldFocus={focusPublicationField} />

          {canEditStatus && !isTemplate && (
            <Field id="status" label="Situação" hint={'“Publicada” aparece no site; “Rascunho” fica só aqui.'}>
              <select id="status" name="status" className="select" value={f.status} onChange={handleChange}>
                {Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          )}
        </fieldset>

        <details className="xl:hidden card p-4"><summary className="cursor-pointer font-semibold text-surface-900">Ver prévia da viagem</summary><div className="mt-4"><TripCardPreview trip={f} /></div></details>

        <div className="fixed bottom-0 inset-x-0 lg:left-64 z-20 bg-white/95 backdrop-blur border-t border-surface-200">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <p className={`${photoPending || hasPendingItems ? '' : 'hidden sm:block'} text-sm text-surface-600`} aria-live="polite">
              {photoPending ? 'Conclua ou descarte a foto antes de salvar.' : hasPendingItems ? 'Adicione ou apague os itens em preenchimento antes de salvar.' : dirty ? 'Você tem alterações não salvas.' : isEditing ? 'Nenhuma alteração.' : 'Será salva como rascunho.'}
            </p>
            <div className="flex gap-3 w-full sm:w-auto">
              <Button onClick={leave} disabled={saving} className="flex-1 sm:flex-none">Cancelar</Button>
              <Button type="submit" variant="primary" disabled={photoPending || savingTemplate} loading={saving} loadingText="Salvando..." icon={<Save className="w-5 h-5" aria-hidden="true" />} className="flex-1 sm:flex-none">
                {isEditing ? 'Salvar alterações' : 'Salvar viagem'}
              </Button>
            </div>
          </div>
        </div>
      </form>
      <div className="hidden xl:block xl:sticky xl:top-6"><TripCardPreview trip={f} /></div>
      </div>

      <div className="space-y-4">
        <TripProposalPreview trip={formData} dirty={dirty} />
      </div>

      <ConfirmDialog
        open={draftDeleteOpen}
        onOpenChange={setDraftDeleteOpen}
        title="Excluir o rascunho original?"
        description="Modelo salvo no banco. Deseja excluir o rascunho original? O modelo continuará salvo."
        cancelLabel="Manter rascunho"
        confirmLabel="Excluir rascunho"
        busyLabel="Excluindo…"
        busy={deletingDraft}
        onConfirm={removeOriginalDraft}
      />
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
