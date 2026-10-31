import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tripApi, TripFormData, TripStatus } from '../api';
import { useToast } from '../hooks/useToast';
import { resolveAssetSrc } from '../lib/assetUrl';
import { isValidImageSrc, IMAGE_SRC_MESSAGE } from '../lib/imageSrc';
import { isoToLocalInput, localInputToIso } from '../lib/dateInput';
import { fillMissingAlt, formatBRL, syncPriceDisplay } from '../lib/formHelpers';
import { canChangeTripStatus } from '../lib/permissions';
import { useAuth } from '../App';

const intensityOptions = ['leve', 'moderado', 'intenso', 'extremo'] as const;
const statusOptions: { value: TripStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'OPEN', label: 'Publicada' },
  { value: 'COMPLETED', label: 'Concluída' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'SOLD_OUT', label: 'Esgotada' },
  { value: 'CLOSED', label: 'Fechada' },
];

const buttonStyleOptions = [
  { value: 'button-dark', label: 'Escuro' },
  { value: 'button-rust', label: 'Laranja' },
  { value: 'button-light', label: 'Claro' },
  { value: 'button-outline', label: 'Só contorno' },
];

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-surface-500 mt-1">{children}</p>;
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
}

function SaveIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;
}

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

  const [formData, setFormData] = useState<TripFormData>({
    title: '',
    headlineDisplay: '',
    category: '',
    description: '',
    city: '',
    region: '',
    startDateISO: isoToLocalInput(new Date().toISOString()),
    endDateISO: '',
    departureTime: '',
    departureTolerance: '',
    returnTime: '',
    scheduleInfo: '',
    scheduleTBD: false,
    priceValue: null,
    priceDisplay: '',
    priceUnit: 'por pessoa',
    free: false,
    intensityClass: 'moderado',
    spotsLeft: null,
    trailDistance: '',
    supportPoint: '',
    supportPointInfo: '',
    meetingCity: '',
    meetingPoint: '',
    meetingDetails: '',
    meetingMapsQuery: '',
    includes: [],
    includesHighlight: '',
    includedServices: [],
    itinerary: [],
    routeNotes: [],
    importantInfo: [],
    media: [],
    buttonLabel: 'Quero viajar',
    buttonClass: 'button-dark',
    status: 'DRAFT',
    availabilitySchema: 'https://schema.org/InStock',
    departures: [],
  });

  useEffect(() => {
    if (isEditing) {
      loadTrip();
    } else {
      setLoading(false);
    }
  }, [id]);

  const loadTrip = async () => {
    try {
      const trip = await tripApi.get(id!);
      setFormData({
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
        intensityClass: trip.intensityClass as TripFormData['intensityClass'],
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
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar viagem');
      navigate('/trips');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (type === 'number') {
      const num = value ? parseFloat(value) : null;
      setFormData(prev => name === 'priceValue'
        ? { ...prev, priceValue: num, priceDisplay: syncPriceDisplay(prev.priceValue, num, prev.priceDisplay || '') }
        : { ...prev, [name]: num });
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleArrayChange = (field: keyof TripFormData, value: string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addArrayItem = (field: keyof TripFormData, item: string) => {
    if (!item.trim()) return;
    const current = (formData[field] as string[]) || [];
    setFormData(prev => ({ ...prev, [field]: [...current, item] }));
  };

  const removeArrayItem = (field: keyof TripFormData, index: number) => {
    const current = (formData[field] as string[]) || [];
    setFormData(prev => ({ ...prev, [field]: current.filter((_, i) => i !== index) }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = 'Título é obrigatório';
    if (!formData.category.trim()) newErrors.category = 'Categoria é obrigatória';
    if (!formData.description.trim()) newErrors.description = 'Descrição é obrigatória';
    if (!formData.city.trim()) newErrors.city = 'Cidade é obrigatória';
    if (!formData.region.trim()) newErrors.region = 'Região é obrigatória';
    if (!formData.startDateISO) newErrors.startDateISO = 'Data de início é obrigatória';
    if (formData.media.some(m => !isValidImageSrc(m.src))) newErrors.media = IMAGE_SRC_MESSAGE;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        ...formData,
        media: fillMissingAlt(formData.media, formData.title).map(m => ({ ...m, focus: m.focus?.trim() || undefined })),
        priceDisplay: formData.priceDisplay || (formData.priceValue && formData.priceValue > 0 && !formData.free ? formatBRL(formData.priceValue) : ''),
        startDateISO: localInputToIso(formData.startDateISO)!,
        endDateISO: localInputToIso(formData.endDateISO),
      };
      if (isEditing) {
        await tripApi.update(id!, payload);
        toast.success('Viagem atualizada com sucesso');
      } else {
        await tripApi.create(payload);
        toast.success('Viagem criada com sucesso');
      }
      navigate('/trips');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar viagem');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner w-8 h-8"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/trips')} className="btn-ghost p-2" aria-label="Voltar">
            <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="page-title">{isEditing ? 'Editar Viagem' : 'Nova Viagem'}</h1>
            <p className="page-description">{isEditing ? 'Atualize as informações da viagem' : 'Crie uma nova viagem comercial'}</p>
          </div>
        </div>
        <button type="button" onClick={handleSubmit} form="trip-form" className="btn-primary" disabled={saving}>
          <SaveIcon className="w-5 h-5" aria-hidden="true" />
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {errors.general && <div className="alert-error" role="alert">{errors.general}</div>}

      <form id="trip-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Essencial */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">O essencial</legend>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="title" className="label">Título *</label>
              <input id="title" name="title" className={`input ${errors.title ? 'input-error' : ''}`} value={formData.title} onChange={handleChange} required />
              {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="category" className="label">Categoria *</label>
              <input id="category" name="category" className={`input ${errors.category ? 'input-error' : ''}`} value={formData.category} onChange={handleChange} required placeholder="Ex: Trilha, Praia, Aventura" />
              {errors.category && <p className="text-red-600 text-sm mt-1">{errors.category}</p>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description" className="label">Descrição *</label>
            <textarea id="description" name="description" className={`input ${errors.description ? 'input-error' : ''}`} value={formData.description} onChange={handleChange} rows={4} required />
            {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="city" className="label">Cidade *</label>
              <input id="city" name="city" className={`input ${errors.city ? 'input-error' : ''}`} value={formData.city} onChange={handleChange} required />
              {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="region" className="label">Estado/Região *</label>
              <input id="region" name="region" className={`input ${errors.region ? 'input-error' : ''}`} value={formData.region} onChange={handleChange} required />
              {errors.region && <p className="text-red-600 text-sm mt-1">{errors.region}</p>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDateISO" className="label">Data de início *</label>
              <input id="startDateISO" name="startDateISO" type="datetime-local" className={`input ${errors.startDateISO ? 'input-error' : ''}`} value={formData.startDateISO} onChange={handleChange} required />
              {errors.startDateISO && <p className="text-red-600 text-sm mt-1">{errors.startDateISO}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="endDateISO" className="label">Data de fim</label>
              <input id="endDateISO" name="endDateISO" type="datetime-local" className="input" value={formData.endDateISO} onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="priceValue" className="label">Valor (R$)</label>
              <input id="priceValue" name="priceValue" type="number" step="0.01" min="0" className="input" value={formData.priceValue ?? ''} onChange={handleChange} placeholder="109.99" disabled={formData.free} />
              <label htmlFor="free" className="checkbox-label mt-2">
                <input id="free" name="free" type="checkbox" className="checkbox-input" checked={formData.free} onChange={handleChange} />
                <span className="text-sm text-surface-700">Viagem gratuita</span>
              </label>
            </div>
            <div className="form-group">
              <label htmlFor="status" className="label">Situação</label>
              <select id="status" name="status" className="select" value={formData.status} onChange={handleChange} disabled={!canEditStatus}>
                {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <Hint>“Publicada” aparece no site; “Rascunho” fica só aqui.</Hint>
              {!canEditStatus && <Hint>Só administradores alteram a situação</Hint>}
            </div>
          </div>

          <div className="form-group">
            <span className="label">Fotos</span>
            <MediaInput
              value={formData.media}
              onChange={(val) => { setFormData(prev => ({ ...prev, media: val })); if (errors.media) setErrors(prev => ({ ...prev, media: '' })); }}
            />
            {errors.media && <p className="text-red-600 text-sm mt-1">{errors.media}</p>}
          </div>
        </fieldset>

        {/* Mais opções */}
        <details className="card">
          <summary className="p-6 cursor-pointer text-lg font-semibold text-surface-900">Mais opções <span className="text-sm font-normal text-surface-500">(horários, o que está incluso, ponto de encontro e outros)</span></summary>
          <div className="px-6 pb-6 space-y-8">

            <fieldset className="space-y-6">
              <legend className="font-semibold text-surface-900 mb-2">Horários</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="departureTime" className="label">Horário de saída</label>
                  <input id="departureTime" name="departureTime" className="input" value={formData.departureTime} onChange={handleChange} placeholder="06h00" />
                  <Hint>Se ficar vazio, o site usa a hora da data de início.</Hint>
                </div>
                <div className="form-group">
                  <label htmlFor="returnTime" className="label">Horário de volta</label>
                  <input id="returnTime" name="returnTime" className="input" value={formData.returnTime} onChange={handleChange} placeholder="18h00" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="scheduleInfo" className="label">Horário em texto livre</label>
                  <input id="scheduleInfo" name="scheduleInfo" className="input" value={formData.scheduleInfo} onChange={handleChange} placeholder="06h às 18h" />
                  <Hint>Se preenchido, aparece no card no lugar de saída e volta.</Hint>
                </div>
                <div className="form-group">
                  <label htmlFor="departureTolerance" className="label">Tempo de espera por atrasados</label>
                  <input id="departureTolerance" name="departureTolerance" className="input" value={formData.departureTolerance} onChange={handleChange} placeholder="30 minutos" />
                </div>
              </div>
              <label htmlFor="scheduleTBD" className="checkbox-label">
                <input id="scheduleTBD" name="scheduleTBD" type="checkbox" className="checkbox-input" checked={formData.scheduleTBD} onChange={handleChange} />
                <span className="text-sm text-surface-700">Horário ainda não definido</span>
              </label>
            </fieldset>

            <fieldset className="space-y-6">
              <legend className="font-semibold text-surface-900 mb-2">Preço no site</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="priceDisplay" className="label">Preço como aparece no site</label>
                  <input id="priceDisplay" name="priceDisplay" className="input" value={formData.priceDisplay} onChange={handleChange} placeholder="R$ 109,99" disabled={formData.free} />
                  <Hint>Acompanha o Valor sozinho. Se você escrever um texto próprio, ele não muda mais.</Hint>
                </div>
                <div className="form-group">
                  <label htmlFor="priceUnit" className="label">Cobrança</label>
                  <input id="priceUnit" name="priceUnit" className="input" value={formData.priceUnit} onChange={handleChange} disabled={formData.free} placeholder="por pessoa" />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-6">
              <legend className="font-semibold text-surface-900 mb-2">Sobre a viagem</legend>
              <div className="form-group">
                <label htmlFor="headlineDisplay" className="label">Título do card</label>
                <input id="headlineDisplay" name="headlineDisplay" className="input" value={formData.headlineDisplay} onChange={handleChange} placeholder="Versão curta do título" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="intensityClass" className="label">Intensidade</label>
                  <select id="intensityClass" name="intensityClass" className="select" value={formData.intensityClass} onChange={handleChange}>
                    {intensityOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="spotsLeft" className="label">Vagas restantes</label>
                  <input id="spotsLeft" name="spotsLeft" type="number" min="0" className="input" value={formData.spotsLeft ?? ''} onChange={handleChange} />
                  <Hint>Aparece no site quando for maior que zero.</Hint>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="trailDistance" className="label">Distância da trilha</label>
                <input id="trailDistance" name="trailDistance" className="input" value={formData.trailDistance} onChange={handleChange} placeholder="aproximadamente 6 km" />
              </div>
              <div className="form-group">
                <label htmlFor="supportPoint" className="label">Ponto de apoio</label>
                <input id="supportPoint" name="supportPoint" className="input" value={formData.supportPoint} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="supportPointInfo" className="label">Informações do ponto de apoio</label>
                <textarea id="supportPointInfo" name="supportPointInfo" className="input" value={formData.supportPointInfo} onChange={handleChange} rows={2} />
              </div>
            </fieldset>

            <fieldset className="space-y-6">
              <legend className="font-semibold text-surface-900 mb-2">O que está incluso</legend>
              <div className="form-group">
                <label className="label">Itens incluídos</label>
                <ArrayInput name="includes" value={formData.includes} onChange={(val) => handleArrayChange('includes', val)} placeholder="Ex: Transporte, Guia, Almoço" />
              </div>
              <div className="form-group">
                <label htmlFor="includesHighlight" className="label">Frase de destaque</label>
                <input id="includesHighlight" name="includesHighlight" className="input" value={formData.includesHighlight} onChange={handleChange} placeholder="Transporte incluso saindo de João Pessoa" />
              </div>
              <div className="form-group">
                <label className="label">Serviços incluídos</label>
                <ArrayInput name="includedServices" value={formData.includedServices || []} onChange={(val) => handleArrayChange('includedServices', val)} placeholder="Ex: Seguro viagem, Kit lanche" />
              </div>
            </fieldset>

            <fieldset className="space-y-6">
              <legend className="font-semibold text-surface-900 mb-2">Roteiro e avisos</legend>
              <div className="form-group">
                <label className="label">Roteiro</label>
                <ArrayInput name="itinerary" value={formData.itinerary || []} onChange={(val) => handleArrayChange('itinerary', val)} placeholder="Ex: 06h - Encontro, 07h - Saída" />
              </div>
              <div className="form-group">
                <label className="label">Observações do percurso</label>
                <ArrayInput name="routeNotes" value={formData.routeNotes || []} onChange={(val) => handleArrayChange('routeNotes', val)} placeholder="Ex: Trilha com trechos íngremes" />
              </div>
              <div className="form-group">
                <label className="label">Informações importantes</label>
                <ArrayInput name="importantInfo" value={formData.importantInfo || []} onChange={(val) => handleArrayChange('importantInfo', val)} placeholder="Ex: Levar 2L de água, Protetor solar" />
              </div>
            </fieldset>

            <fieldset className="space-y-6">
              <legend className="font-semibold text-surface-900 mb-2">Ponto de encontro</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="meetingCity" className="label">Cidade</label>
                  <input id="meetingCity" name="meetingCity" className="input" value={formData.meetingCity} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="meetingPoint" className="label">Local</label>
                  <input id="meetingPoint" name="meetingPoint" className="input" value={formData.meetingPoint} onChange={handleChange} />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="meetingDetails" className="label">Detalhes</label>
                <textarea id="meetingDetails" name="meetingDetails" className="input" value={formData.meetingDetails} onChange={handleChange} rows={2} />
              </div>
              <div className="form-group">
                <label htmlFor="meetingMapsQuery" className="label">Endereço para o Google Maps</label>
                <input id="meetingMapsQuery" name="meetingMapsQuery" className="input" value={formData.meetingMapsQuery} onChange={handleChange} placeholder="Rua Exemplo, 123 - Bairro, Cidade/UF" />
                <Hint>Se preenchido, o local no card vira um link que abre o Google Maps.</Hint>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="font-semibold text-surface-900 mb-2">Pontos de partida</legend>
              <p className="text-sm text-surface-500">Use quando o grupo sai de mais de um lugar. Cada ponto aparece no card com seu horário.</p>
              <DeparturesInput
                value={formData.departures}
                onChange={(val) => setFormData(prev => ({ ...prev, departures: val }))}
              />
            </fieldset>

            <fieldset className="space-y-6">
              <legend className="font-semibold text-surface-900 mb-2">Botão do card</legend>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="buttonLabel" className="label">Texto do botão</label>
                  <input id="buttonLabel" name="buttonLabel" className="input" value={formData.buttonLabel} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="buttonClass" className="label">Cor do botão</label>
                  <select id="buttonClass" name="buttonClass" className="select" value={formData.buttonClass} onChange={handleChange}>
                    {buttonStyleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    {!buttonStyleOptions.some(o => o.value === formData.buttonClass) && <option value={formData.buttonClass}>Personalizada ({formData.buttonClass})</option>}
                  </select>
                </div>
              </div>
            </fieldset>
          </div>
        </details>

        {/* Submit buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
          <button type="button" onClick={() => navigate('/trips')} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            <SaveIcon className="w-5 h-5" aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar Viagem'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Helper components
function ArrayInput({ name, value, onChange, placeholder }: { name: string; value: string[]; onChange: (val: string[]) => void; placeholder: string }) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    if (newItem.trim()) {
      onChange([...value, newItem.trim()]);
      setNewItem('');
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          className="input flex-1"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder={placeholder}
        />
        <button type="button" className="btn-secondary" onClick={handleAdd}>Adicionar</button>
      </div>
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="flex-1 text-sm text-surface-700 bg-surface-50 px-3 py-2 rounded-lg border border-surface-200">{item}</span>
          <button type="button" className="btn-ghost p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remover ${item}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      {value.length === 0 && <p className="text-sm text-surface-400">Nenhum item adicionado</p>}
    </div>
  );
}

type MediaItem = { src: string; alt: string; focus?: string; type?: 'image' | 'video' };

const VIDEO_EXT = /\.(mp4|webm|mov)(\?.*)?$/i;

function MediaInput({ value, onChange }: { value: MediaItem[]; onChange: (val: MediaItem[]) => void }) {
  const { toast } = useToast();
  const [newSrc, setNewSrc] = useState('');

  const handleAdd = () => {
    const src = newSrc.trim();
    if (!src) return;
    if (!isValidImageSrc(src)) { toast.error(IMAGE_SRC_MESSAGE); return; }
    onChange([...value, { src, alt: '', type: VIDEO_EXT.test(src) ? 'video' : 'image' }]);
    setNewSrc('');
  };

  const update = (index: number, patch: Partial<MediaItem>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          className="input flex-1 min-w-0"
          placeholder="Link da foto (ex: assets/images/pasta/foto.jpg)"
          aria-label="Link da foto"
          value={newSrc}
          onChange={(e) => setNewSrc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
        />
        <button type="button" className="btn-primary" onClick={handleAdd}>Adicionar foto</button>
      </div>
      {value.map((item, index) => (
        <div key={index} className="p-2 bg-surface-50 rounded-lg">
          <div className="flex items-center gap-2">
            <img src={resolveAssetSrc(item.src)} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0 bg-surface-100" loading="lazy" />
            <input type="text" className="input flex-1 min-w-0" value={item.src} onChange={(e) => update(index, { src: e.target.value })} aria-label={`Link da foto ${index + 1}`} />
            {item.type === 'video' && <span className="badge badge-info">Vídeo</span>}
            <button type="button" className="btn-ghost p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remover foto ${index + 1}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <details className="mt-1 ml-14 text-sm">
            <summary className="cursor-pointer text-surface-500">Descrição da foto (opcional)</summary>
            <input type="text" className="input mt-1" value={item.alt} onChange={(e) => update(index, { alt: e.target.value })} placeholder="Se ficar vazia, usamos o título da viagem" aria-label={`Descrição da foto ${index + 1} (opcional)`} />
            {item.focus !== undefined && (
              <input type="text" className="input mt-1" value={item.focus} onChange={(e) => update(index, { focus: e.target.value })} placeholder="Parte da foto em destaque" aria-label={`Parte da foto ${index + 1} em destaque`} />
            )}
          </details>
        </div>
      ))}
      {value.length === 0 && <p className="text-sm text-surface-400">Nenhuma foto adicionada</p>}
    </div>
  );
}

function DeparturesInput({ value, onChange }: { value: Array<{ time: string; place: string; city: string; mapsUrl?: string; mapsQuery?: string; orderIndex: number }>; onChange: (val: Array<{ time: string; place: string; city: string; mapsUrl?: string; mapsQuery?: string; orderIndex: number }>) => void }) {
  const [newTime, setNewTime] = useState('');
  const [newPlace, setNewPlace] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newMapsUrl, setNewMapsUrl] = useState('');
  const [newMapsQuery, setNewMapsQuery] = useState('');

  const handleAdd = () => {
    if (newTime.trim() && newPlace.trim() && newCity.trim()) {
      onChange([...value, { 
        time: newTime.trim(), 
        place: newPlace.trim(), 
        city: newCity.trim(), 
        mapsUrl: newMapsUrl.trim() || undefined, 
        mapsQuery: newMapsQuery.trim() || undefined, 
        orderIndex: value.length 
      }]);
      setNewTime('');
      setNewPlace('');
      setNewCity('');
      setNewMapsUrl('');
      setNewMapsQuery('');
    }
  };

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-2">
        <input type="text" className="input" placeholder="Horário (ex: 06h00)" value={newTime} onChange={(e) => setNewTime(e.target.value)} onKeyDown={handleEnter} />
        <input type="text" className="input" placeholder="Local (ex: Shopping)" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} onKeyDown={handleEnter} />
        <input type="text" className="input" placeholder="Cidade" value={newCity} onChange={(e) => setNewCity(e.target.value)} onKeyDown={handleEnter} />
        <input type="url" className="input" placeholder="Link do Google Maps (opcional)" aria-label="Link do Google Maps (opcional)" value={newMapsUrl} onChange={(e) => setNewMapsUrl(e.target.value)} onKeyDown={handleEnter} />
        <div className="flex gap-2">
          <input type="text" className="input flex-1" placeholder="Endereço no Google Maps (opcional)" aria-label="Endereço no Google Maps (opcional)" value={newMapsQuery} onChange={(e) => setNewMapsQuery(e.target.value)} onKeyDown={handleEnter} />
          <button type="button" className="btn-primary" onClick={handleAdd}>Adicionar</button>
        </div>
      </div>
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-2 p-2 bg-surface-50 rounded-lg flex-wrap">
          <span className="font-mono text-sm text-surface-700 bg-white px-2 py-1 rounded border border-surface-200">{item.time}</span>
          <span className="text-sm font-medium text-surface-900">{item.place}</span>
          <span className="text-sm text-surface-500">{item.city}</span>
          {(item.mapsUrl || item.mapsQuery) && <span className="badge badge-info">Google Maps</span>}
          <button type="button" className="btn-ghost p-1 ml-auto text-red-600 hover:bg-red-50" onClick={() => onChange(value.filter((_, i) => i !== index).map((d, i) => ({ ...d, orderIndex: i })))} aria-label={`Remover ponto de partida`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      {value.length === 0 && <p className="text-sm text-surface-400">Nenhum ponto de partida adicionado</p>}
    </div>
  );
}