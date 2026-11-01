import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { tripApi, TripFormData } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../App';
import { CityAutocomplete, UfSelect } from '../components/LocationFields';
import { nextCityOnRegionChange } from '../lib/locationCombobox';
import { isValidImageSrc, IMAGE_SRC_MESSAGE } from '../lib/imageSrc';
import { isoToLocalInput, localInputToIso } from '../lib/dateInput';
import { fillMissingAlt, formatBRL, syncPriceDisplay } from '../lib/formHelpers';
import { canChangeTripStatus } from '../lib/permissions';
import { applyTripDefaults, countAdvancedFilled, countFilled, formatPriceInput, parsePriceInput, parseWholeNumber, TRIP_STATUS_LABELS, validateTripMinimum } from '../lib/panelHelpers';
import Button from '../components/Button';
import Field from '../components/Field';
import FormSection from '../components/FormSection';
import ConfirmDialog from '../components/ConfirmDialog';
import AiDraftBlock from '../components/AiDraftBlock';
import { applySuggestions, type DraftKey, type TripDraft } from '../lib/aiDraft';
import { ArrayInput, DeparturesInput, MediaInput } from '../components/TripFormInputs';

const intensityOptions = ['leve', 'moderado', 'intenso', 'extremo'] as const;

const buttonStyleOptions = [
  { value: 'button-dark', label: 'Escuro' },
  { value: 'button-rust', label: 'Laranja' },
  { value: 'button-light', label: 'Claro' },
  { value: 'button-outline', label: 'Só contorno' },
];

// Campo com problema -> id do campo na tela (para levar o foco até ele).
const ERROR_TARGETS: Record<string, string> = {
  title: 'title', region: 'region', city: 'city', startDateISO: 'startDateISO', priceValue: 'priceValue', media: 'media-link',
};
const ERROR_LABELS: Record<string, string> = {
  title: 'Nome da viagem', region: 'Estado', city: 'Cidade', startDateISO: 'Data de saída', priceValue: 'Valor', media: 'Fotos',
};

// Todos os campos existem sempre no formulário (texto vazio, lista vazia); só valor e vagas podem ser "nenhum".
type AllRequired = { [K in keyof Required<TripFormData>]: NonNullable<Required<TripFormData>[K]> };
type FormState = Omit<AllRequired, 'priceValue' | 'spotsLeft'> & { priceValue: number | null; spotsLeft: number | null };

const emptyForm = (): FormState => ({
  title: '', headlineDisplay: '', category: '', description: '', city: '', region: '',
  startDateISO: isoToLocalInput(new Date().toISOString()), endDateISO: '',
  departureTime: '', departureTolerance: '', returnTime: '', scheduleInfo: '', scheduleTBD: false,
  priceValue: null, priceDisplay: '', priceUnit: 'por pessoa', free: false,
  intensityClass: 'moderado', spotsLeft: null, trailDistance: '', supportPoint: '', supportPointInfo: '',
  meetingCity: '', meetingPoint: '', meetingDetails: '', meetingMapsQuery: '',
  includes: [], includesHighlight: '', includedServices: [], itinerary: [], routeNotes: [], importantInfo: [],
  media: [], buttonLabel: 'Quero viajar', buttonClass: 'button-dark', status: 'DRAFT',
  availabilitySchema: 'https://schema.org/InStock', departures: [],
});

export default function TripForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditStatus = canChangeTripStatus(user?.role);
  const isEditing = !!id;
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [priceText, setPriceText] = useState('');
  // Datas como vieram da API: se a pessoa não mexe na data, o valor guardado não muda.
  const originalDates = useRef<{ start: string | null; end: string | null }>({ start: null, end: null });
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
    // Datas vêm como AAAA-MM-DDT00:00:00.000Z; o campo do painel usa horário local.
    for (const k of ['startDateISO', 'endDateISO'] as const) {
      if (next[k] !== formData[k]) next[k] = isoToLocalInput(next[k]);
    }
    setFormData(next);
    toast.success('Campos preenchidos. Revise e clique em Salvar.');
  };

  const dirty = JSON.stringify(formData) !== initialRef.current;

  // Avisa antes de fechar a aba com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const loadTrip = async () => {
    try {
      const trip = await tripApi.get(id!);
      const loaded: FormState = {
        title: trip.title,
        headlineDisplay: trip.headlineDisplay || '',
        category: trip.category,
        description: trip.description,
        city: trip.city,
        region: trip.region,
        startDateISO: isoToLocalInput(trip.startDateISO),
        endDateISO: isoToLocalInput(trip.endDateISO),
        departureTime: trip.departureTime || '',
        departureTolerance: trip.departureTolerance || '',
        returnTime: trip.returnTime || '',
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
        meetingDetails: trip.meetingDetails || '',
        meetingMapsQuery: trip.meetingMapsQuery || '',
        includes: trip.includes,
        includesHighlight: trip.includesHighlight || '',
        includedServices: trip.includedServices || [],
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
      initialRef.current = JSON.stringify(loaded);
      originalDates.current = { start: trip.startDateISO, end: trip.endDateISO };
      setPriceText(formatPriceInput(loaded.priceValue));
      setFormData(loaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir a viagem.');
      navigate('/trips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isEditing) loadTrip();
    else setLoading(false);
  }, [id]);

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
    if (!validate()) return;

    setSaving(true);
    try {
      const withDefaults = applyTripDefaults(formData);
      const payload = {
        ...withDefaults,
        media: fillMissingAlt(formData.media, formData.title).map(m => ({ ...m, focus: m.focus?.trim() || undefined })),
        priceDisplay: formData.priceDisplay || (formData.priceValue && formData.priceValue > 0 && !formData.free ? formatBRL(formData.priceValue) : ''),
        startDateISO: localInputToIso(formData.startDateISO, originalDates.current.start)!,
        endDateISO: localInputToIso(formData.endDateISO, originalDates.current.end),
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
  const err = (name: string) => errors[name] || undefined;
  const invalid = (name: string) => (errors[name] ? 'input-error' : '');

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button type="button" onClick={leave} className="btn-icon" aria-label="Voltar para a lista de viagens">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h1 className="page-title">{isEditing ? 'Editar viagem' : 'Nova viagem'}</h1>
          <p className="page-description">{isEditing ? 'Mude o que precisar e salve.' : 'Preencha o básico. O resto é opcional e pode ficar para depois.'}</p>
        </div>
      </div>

      <AiDraftBlock form={formData as Record<string, unknown>} defaults={defaultsRef.current} onApply={applyAiDraft} />

      <form id="trip-form" onSubmit={handleSubmit} noValidate className="space-y-4">
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

        <fieldset className="card p-5 space-y-5">
          <legend className="sr-only">Dados básicos</legend>
          <h2 className="text-lg font-semibold text-surface-900">O básico</h2>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="startDateISO" label="Data e hora de saída" required error={err('startDateISO')}>
              <input id="startDateISO" name="startDateISO" type="datetime-local" className={`input ${invalid('startDateISO')}`} value={f.startDateISO} onChange={handleChange} aria-invalid={!!errors.startDateISO} />
            </Field>
            <div>
              <Field id="priceValue" label="Valor (R$)" error={err('priceValue')} hint={f.free ? 'Viagem gratuita: sem valor.' : 'Ex.: 109,99 ou 1.250,00'}>
                <input id="priceValue" name="priceValue" type="text" inputMode="decimal" className={`input ${invalid('priceValue')}`} value={priceText} onChange={handlePriceChange} placeholder="109,99" disabled={f.free} aria-invalid={!!errors.priceValue} autoComplete="off" />
              </Field>
              <label htmlFor="free" className="checkbox-label mt-2 min-h-[32px]">
                <input id="free" name="free" type="checkbox" className="checkbox-input" checked={f.free} onChange={(e) => { handleChange(e); clearError('priceValue'); }} />
                <span className="text-sm text-surface-700">Viagem gratuita</span>
              </label>
            </div>
          </div>

          <div>
            <Field id="status" label="Situação" hint="“Publicada” aparece no site; “Rascunho” fica só aqui. Também dá para publicar pela lista de viagens.">
              <select id="status" name="status" className="select" value={f.status} onChange={handleChange} disabled={!canEditStatus}>
                {Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            {!canEditStatus && <p className="hint">Só administradores alteram a situação.</p>}
          </div>

          <div className="form-group !mb-0">
            <span className="label" id="media-label">Fotos</span>
            <p className="hint mb-2">A primeira foto é a capa. Dá para salvar como rascunho sem foto; para publicar, precisa de pelo menos uma.</p>
            <MediaInput
              inputId="media-link"
              value={f.media}
              onChange={(val) => { setFormData(prev => ({ ...prev, media: val })); clearError('media'); }}
            />
            {errors.media && <p className="field-error" role="alert">{errors.media}</p>}
          </div>
        </fieldset>

        <p className="text-sm text-surface-600 px-1">Mais detalhes (todos opcionais). O que você preencher aqui fica guardado mesmo com a seção fechada.</p>

        <FormSection title="Sobre a viagem" summary="Descrição, categoria, intensidade, vagas e o que inclui" filled={countFilled([f.category, f.description, f.spotsLeft, f.includes])}>
          <Field id="description" label="Descrição" hint="Se ficar vazia, usamos o nome da viagem.">
            <textarea id="description" name="description" className="input" value={f.description} onChange={handleChange} rows={4} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="category" label="Categoria" hint="Se ficar vazia, usamos “Viagem”.">
              <input id="category" name="category" className="input" value={f.category} onChange={handleChange} placeholder="Ex.: Trilha, Praia, Aventura" />
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
          <Field id="includes-input" label="O que inclui">
            <ArrayInput id="includes-input" value={f.includes} onChange={(val) => setList('includes', val)} placeholder="Ex.: Transporte, Guia, Almoço" />
          </Field>
        </FormSection>

        <FormSection title="Embarque e horários" summary="Onde o grupo se encontra, saída e volta" filled={countFilled([f.meetingCity, f.meetingPoint, f.endDateISO, f.departureTime, f.returnTime])}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="meetingCity" label="Cidade de embarque">
              <input id="meetingCity" name="meetingCity" className="input" value={f.meetingCity} onChange={handleChange} />
            </Field>
            <Field id="meetingPoint" label="Local de embarque">
              <input id="meetingPoint" name="meetingPoint" className="input" value={f.meetingPoint} onChange={handleChange} />
            </Field>
            <Field id="departureTime" label="Horário de saída" hint="Se ficar vazio, o site usa a hora da data de saída.">
              <input id="departureTime" name="departureTime" className="input" value={f.departureTime} onChange={handleChange} placeholder="06h00" />
            </Field>
            <Field id="endDateISO" label="Data e hora de volta">
              <input id="endDateISO" name="endDateISO" type="datetime-local" className="input" value={f.endDateISO} onChange={handleChange} />
            </Field>
            <Field id="returnTime" label="Horário de volta">
              <input id="returnTime" name="returnTime" className="input" value={f.returnTime} onChange={handleChange} placeholder="18h00" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Roteiro e avisos" summary="Passo a passo e o que o cliente precisa saber" filled={countFilled([f.itinerary, f.routeNotes, f.importantInfo])}>
          <Field id="itinerary-input" label="Roteiro">
            <ArrayInput id="itinerary-input" value={f.itinerary} onChange={(val) => setList('itinerary', val)} placeholder="Ex.: 06h - Encontro, 07h - Saída" />
          </Field>
          <Field id="route-notes-input" label="Observações do percurso">
            <ArrayInput id="route-notes-input" value={f.routeNotes} onChange={(val) => setList('routeNotes', val)} placeholder="Ex.: Trilha com trechos íngremes" />
          </Field>
          <Field id="important-info-input" label="Informações importantes">
            <ArrayInput id="important-info-input" value={f.importantInfo} onChange={(val) => setList('importantInfo', val)} placeholder="Ex.: Levar 2 litros de água" />
          </Field>
        </FormSection>

        <FormSection title="Ajustes do site (raramente necessário)" summary="Tudo aqui tem um valor automático. Só mexa se precisar." filled={countAdvancedFilled(f)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="headlineDisplay" label="Título do card" hint="Opcional: uma versão menor do nome.">
              <input id="headlineDisplay" name="headlineDisplay" className="input" value={f.headlineDisplay} onChange={handleChange} />
            </Field>
            <Field id="priceDisplay" label="Texto do preço" hint="Acompanha o Valor sozinho. Se você escrever um texto próprio, ele não muda mais.">
              <input id="priceDisplay" name="priceDisplay" className="input" value={f.priceDisplay} onChange={handleChange} placeholder="R$ 109,99" disabled={f.free} />
            </Field>
            <Field id="priceUnit" label="Unidade do preço" hint="Padrão: por pessoa.">
              <input id="priceUnit" name="priceUnit" className="input" value={f.priceUnit} onChange={handleChange} disabled={f.free} placeholder="por pessoa" />
            </Field>
            <Field id="departureTolerance" label="Tolerância de espera por atrasados">
              <input id="departureTolerance" name="departureTolerance" className="input" value={f.departureTolerance} onChange={handleChange} placeholder="30 minutos" />
            </Field>
            <Field id="buttonLabel" label="Texto do botão" hint="Padrão: Quero viajar.">
              <input id="buttonLabel" name="buttonLabel" className="input" value={f.buttonLabel} onChange={handleChange} />
            </Field>
            <Field id="buttonClass" label="Cor do botão">
              <select id="buttonClass" name="buttonClass" className="select" value={f.buttonClass} onChange={handleChange}>
                {buttonStyleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                {!buttonStyleOptions.some(o => o.value === f.buttonClass) && <option value={f.buttonClass}>Personalizada ({f.buttonClass})</option>}
              </select>
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
          <Field id="included-services-input" label="Serviços incluídos">
            <ArrayInput id="included-services-input" value={f.includedServices} onChange={(val) => setList('includedServices', val)} placeholder="Ex.: Seguro viagem, Kit lanche" />
          </Field>
          <Field id="meetingDetails" label="Detalhes do embarque">
            <textarea id="meetingDetails" name="meetingDetails" className="input" value={f.meetingDetails} onChange={handleChange} rows={2} />
          </Field>
          <Field id="meetingMapsQuery" label="Endereço para o mapa (Google Maps)" hint="Se preenchido, o local no card vira um link que abre o Google Maps.">
            <input id="meetingMapsQuery" name="meetingMapsQuery" className="input" value={f.meetingMapsQuery} onChange={handleChange} placeholder="Rua Exemplo, 123 - Bairro, Cidade/UF" />
          </Field>
          <div>
            <p className="label">Saídas de mais de um lugar</p>
            <p className="hint mb-2">Use quando o grupo sai de mais de um lugar. Cada ponto aparece no card com seu horário.</p>
            <DeparturesInput value={f.departures} onChange={(val) => setFormData(prev => ({ ...prev, departures: val }))} />
          </div>
        </FormSection>

        <div className="fixed bottom-0 inset-x-0 lg:left-64 z-20 bg-white/95 backdrop-blur border-t border-surface-200">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <p className="hidden sm:block text-sm text-surface-600" aria-live="polite">
              {dirty ? 'Você tem alterações não salvas.' : isEditing ? 'Nenhuma alteração.' : 'Será salva como rascunho.'}
            </p>
            <div className="flex gap-3 w-full sm:w-auto">
              <Button onClick={leave} disabled={saving} className="flex-1 sm:flex-none">Cancelar</Button>
              <Button type="submit" variant="primary" loading={saving} loadingText="Salvando..." icon={<Save className="w-5 h-5" aria-hidden="true" />} className="flex-1 sm:flex-none">
                {isEditing ? 'Salvar alterações' : 'Salvar viagem'}
              </Button>
            </div>
          </div>
        </div>
      </form>

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
