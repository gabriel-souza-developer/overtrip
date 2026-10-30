import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tripApi, TripFormData, TripStatus } from '../api';
import { useToast } from '../hooks/useToast';
import { resolveAssetSrc } from '../lib/assetUrl';

const intensityOptions = ['leve', 'moderado', 'intenso', 'extremo'] as const;
const statusOptions: { value: TripStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'OPEN', label: 'Publicada' },
  { value: 'COMPLETED', label: 'Concluída' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'SOLD_OUT', label: 'Esgotada' },
  { value: 'CLOSED', label: 'Fechada' },
];

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
    startDateISO: new Date().toISOString().slice(0, 16),
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
        startDateISO: trip.startDateISO.slice(0, 16),
        endDateISO: trip.endDateISO ? trip.endDateISO.slice(0, 16) : '',
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
      setFormData(prev => ({ ...prev, [name]: value ? parseFloat(value) : null }));
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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      if (isEditing) {
        await tripApi.update(id!, formData);
        toast.success('Viagem atualizada com sucesso');
      } else {
        await tripApi.create(formData);
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
        {/* Basic Info */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Informações Básicas</legend>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="title" className="label">Título *</label>
              <input id="title" name="title" className={`input ${errors.title ? 'input-error' : ''}`} value={formData.title} onChange={handleChange} required />
              {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="category" className="label">Categoria *</label>
              <input id="category" name="category" className={`input ${errors.category ? 'input-error' : ''}`} value={formData.category} onChange={handleChange} required />
              {errors.category && <p className="text-red-600 text-sm mt-1">{errors.category}</p>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="headlineDisplay" className="label">Headline (exibição no card)</label>
            <input id="headlineDisplay" name="headlineDisplay" className="input" value={formData.headlineDisplay} onChange={handleChange} placeholder="Título curto para cards" />
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
        </fieldset>

        {/* Dates & Schedule */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Datas e Horários</legend>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDateISO" className="label">Data Início *</label>
              <input id="startDateISO" name="startDateISO" type="datetime-local" className={`input ${errors.startDateISO ? 'input-error' : ''}`} value={formData.startDateISO} onChange={handleChange} required />
              {errors.startDateISO && <p className="text-red-600 text-sm mt-1">{errors.startDateISO}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="endDateISO" className="label">Data Fim</label>
              <input id="endDateISO" name="endDateISO" type="datetime-local" className="input" value={formData.endDateISO} onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="departureTime" className="label">Horário Saída</label>
              <input id="departureTime" name="departureTime" className="input" value={formData.departureTime} onChange={handleChange} placeholder="06h00" />
            </div>
            <div className="form-group">
              <label htmlFor="departureTolerance" className="label">Tolerância</label>
              <input id="departureTolerance" name="departureTolerance" className="input" value={formData.departureTolerance} onChange={handleChange} placeholder="30 minutos" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="returnTime" className="label">Horário Retorno</label>
              <input id="returnTime" name="returnTime" className="input" value={formData.returnTime} onChange={handleChange} placeholder="18h00" />
            </div>
            <div className="form-group">
              <label htmlFor="scheduleInfo" className="label">Info Agenda</label>
              <input id="scheduleInfo" name="scheduleInfo" className="input" value={formData.scheduleInfo} onChange={handleChange} placeholder="06h às 18h" />
            </div>
          </div>

          <div className="form-group checkbox-label">
            <input id="scheduleTBD" name="scheduleTBD" type="checkbox" className="checkbox-input" checked={formData.scheduleTBD} onChange={handleChange} />
            <span className="text-sm text-surface-700">Horário a definir (TBD)</span>
          </div>
        </fieldset>

        {/* Pricing */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Preços</legend>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="free" className="checkbox-label">
                <input id="free" name="free" type="checkbox" className="checkbox-input" checked={formData.free} onChange={handleChange} />
                <span className="text-sm text-surface-700">Gratuito</span>
              </label>
            </div>
            <div className="form-group">
              <label htmlFor="priceValue" className="label">Valor</label>
              <input id="priceValue" name="priceValue" type="number" step="0.01" min="0" className="input" value={formData.priceValue ?? ''} onChange={handleChange} placeholder="109.99" disabled={formData.free} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="priceDisplay" className="label">Preço Exibição</label>
              <input id="priceDisplay" name="priceDisplay" className="input" value={formData.priceDisplay} onChange={handleChange} placeholder="R$ 109,99" disabled={formData.free} />
            </div>
            <div className="form-group">
              <label htmlFor="priceUnit" className="label">Unidade</label>
              <input id="priceUnit" name="priceUnit" className="input" value={formData.priceUnit} onChange={handleChange} disabled={formData.free} />
            </div>
          </div>
        </fieldset>

        {/* Details */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Detalhes da Viagem</legend>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="intensityClass" className="label">Intensidade</label>
              <select id="intensityClass" name="intensityClass" className="select" value={formData.intensityClass} onChange={handleChange}>
                {intensityOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="spotsLeft" className="label">Vagas Restantes</label>
              <input id="spotsLeft" name="spotsLeft" type="number" min="0" className="input" value={formData.spotsLeft ?? ''} onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="trailDistance" className="label">Distância da Trilha</label>
              <input id="trailDistance" name="trailDistance" className="input" value={formData.trailDistance} onChange={handleChange} placeholder="aproximadamente 6 km" />
            </div>
            <div className="form-group">
              <label htmlFor="status" className="label">Status</label>
              <select id="status" name="status" className="select" value={formData.status} onChange={handleChange}>
                {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="supportPoint" className="label">Ponto de Apoio</label>
            <input id="supportPoint" name="supportPoint" className="input" value={formData.supportPoint} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label htmlFor="supportPointInfo" className="label">Info Ponto de Apoio</label>
            <textarea id="supportPointInfo" name="supportPointInfo" className="input" value={formData.supportPointInfo} onChange={handleChange} rows={2} />
          </div>

          <div className="form-group">
            <label className="label">Inclui (um por linha)</label>
            <ArrayInput
              name="includes"
              value={formData.includes}
              onChange={(val) => handleArrayChange('includes', val)}
              placeholder="Ex: Transporte, Guia, Almoço"
            />
          </div>

          <div className="form-group">
            <label htmlFor="includesHighlight" className="label">Destaque dos Incluídos</label>
            <input id="includesHighlight" name="includesHighlight" className="input" value={formData.includesHighlight} onChange={handleChange} placeholder="Transporte incluso saindo de João Pessoa" />
          </div>

          <div className="form-group">
            <label className="label">Serviços Incluídos (um por linha)</label>
            <ArrayInput
              name="includedServices"
              value={formData.includedServices || []}
              onChange={(val) => handleArrayChange('includedServices', val)}
              placeholder="Ex: Seguro viagem, Kit lanche"
            />
          </div>

          <div className="form-group">
            <label className="label">Roteiro (um por linha)</label>
            <ArrayInput
              name="itinerary"
              value={formData.itinerary || []}
              onChange={(val) => handleArrayChange('itinerary', val)}
              placeholder="Ex: 06h - Encontro, 07h - Saída"
            />
          </div>

          <div className="form-group">
            <label className="label">Notas da Rota (um por linha)</label>
            <ArrayInput
              name="routeNotes"
              value={formData.routeNotes || []}
              onChange={(val) => handleArrayChange('routeNotes', val)}
              placeholder="Ex: Trilha com trechos íngremes"
            />
          </div>

          <div className="form-group">
            <label className="label">Informações Importantes (um por linha)</label>
            <ArrayInput
              name="importantInfo"
              value={formData.importantInfo || []}
              onChange={(val) => handleArrayChange('importantInfo', val)}
              placeholder="Ex: Levar 2L de água, Protetor solar"
            />
          </div>
        </fieldset>

        {/* Meeting Point */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Ponto de Encontro</legend>
          
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
            <label htmlFor="meetingMapsQuery" className="label">Query Google Maps</label>
            <input id="meetingMapsQuery" name="meetingMapsQuery" className="input" value={formData.meetingMapsQuery} onChange={handleChange} placeholder="Rua Exemplo, 123 - Bairro, Cidade/UF" />
          </div>
        </fieldset>

        {/* Media */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Mídia</legend>
          
          <MediaInput
            value={formData.media}
            onChange={(val) => setFormData(prev => ({ ...prev, media: val }))}
          />
        </fieldset>

        {/* Departures */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Pontos de Partida</legend>
          
          <DeparturesInput
            value={formData.departures}
            onChange={(val) => setFormData(prev => ({ ...prev, departures: val }))}
          />
        </fieldset>

        {/* Button Config */}
        <fieldset className="card p-6 space-y-6">
          <legend className="text-lg font-semibold text-surface-900">Configuração do Botão</legend>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="buttonLabel" className="label">Texto do Botão</label>
              <input id="buttonLabel" name="buttonLabel" className="input" value={formData.buttonLabel} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="buttonClass" className="label">Classe CSS</label>
              <input id="buttonClass" name="buttonClass" className="input" value={formData.buttonClass} onChange={handleChange} />
            </div>
          </div>
        </fieldset>

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

function MediaInput({ value, onChange }: { value: Array<{ src: string; alt: string; focus?: string; type?: 'image' | 'video' }>; onChange: (val: Array<{ src: string; alt: string; focus?: string; type?: 'image' | 'video' }>) => void }) {
  const [newSrc, setNewSrc] = useState('');
  const [newAlt, setNewAlt] = useState('');
  const [newFocus, setNewFocus] = useState('');
  const [newType, setNewType] = useState<'image' | 'video'>('image');

  const handleAdd = () => {
    if (newSrc.trim() && newAlt.trim()) {
      onChange([...value, { src: newSrc.trim(), alt: newAlt.trim(), focus: newFocus.trim() || undefined, type: newType }]);
      setNewSrc('');
      setNewAlt('');
      setNewFocus('');
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
        <input type="url" className="input" placeholder="URL da imagem/vídeo" value={newSrc} onChange={(e) => setNewSrc(e.target.value)} required />
        <input type="text" className="input" placeholder="Texto alternativo (alt)" value={newAlt} onChange={(e) => setNewAlt(e.target.value)} required />
        <input type="text" className="input" placeholder="Foco (opcional)" value={newFocus} onChange={(e) => setNewFocus(e.target.value)} />
        <div className="flex gap-2">
          <select className="select" value={newType} onChange={(e) => setNewType(e.target.value as 'image' | 'video')}>
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
          </select>
          <button type="button" className="btn-primary" onClick={handleAdd}>Adicionar</button>
        </div>
      </div>
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-2 p-2 bg-surface-50 rounded-lg">
          <img src={resolveAssetSrc(item.src)} alt={item.alt} className="w-12 h-12 object-cover rounded" loading="lazy" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-surface-900 truncate">{item.src}</p>
            <p className="text-xs text-surface-500">Alt: {item.alt}</p>
            {item.focus && <p className="text-xs text-surface-500">Foco: {item.focus}</p>}
            <span className={`badge ${item.type === 'video' ? 'badge-info' : 'badge-neutral'}`}>{item.type}</span>
          </div>
          <button type="button" className="btn-ghost p-1 text-red-600 hover:bg-red-50" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remover mídia`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      {value.length === 0 && <p className="text-sm text-surface-400">Nenhuma mídia adicionada</p>}
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

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-2">
        <input type="text" className="input" placeholder="Horário (ex: 06h00)" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
        <input type="text" className="input" placeholder="Local (ex: Shopping)" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} required />
        <input type="text" className="input" placeholder="Cidade" value={newCity} onChange={(e) => setNewCity(e.target.value)} required />
        <input type="url" className="input" placeholder="Maps URL (opcional)" value={newMapsUrl} onChange={(e) => setNewMapsUrl(e.target.value)} />
        <div className="flex gap-2">
          <input type="text" className="input flex-1" placeholder="Maps Query (opcional)" value={newMapsQuery} onChange={(e) => setNewMapsQuery(e.target.value)} />
          <button type="button" className="btn-primary" onClick={handleAdd}>Adicionar</button>
        </div>
      </div>
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-2 p-2 bg-surface-50 rounded-lg flex-wrap">
          <span className="font-mono text-sm text-surface-700 bg-white px-2 py-1 rounded border border-surface-200">{item.time}</span>
          <span className="text-sm font-medium text-surface-900">{item.place}</span>
          <span className="text-sm text-surface-500">{item.city}</span>
          {item.mapsUrl && <span className="badge badge-info">Maps</span>}
          <button type="button" className="btn-ghost p-1 ml-auto text-red-600 hover:bg-red-50" onClick={() => onChange(value.filter((_, i) => i !== index).map((d, i) => ({ ...d, orderIndex: i })))} aria-label={`Remover ponto de partida`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      {value.length === 0 && <p className="text-sm text-surface-400">Nenhum ponto de partida adicionado</p>}
    </div>
  );
}