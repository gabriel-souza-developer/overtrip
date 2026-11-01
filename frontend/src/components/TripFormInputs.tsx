import React, { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Plus, Star, X } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { isValidImageSrc, IMAGE_SRC_MESSAGE } from '../lib/imageSrc';
import ImageThumb from './ImageThumb';
import Button from './Button';
import { visitApi } from '../api';
import { fetchAllPages, filterPlaces, groupVisitPlaces, type VisitPlace } from '../lib/visitPlaces';

/** Busca um destino já visitado e preenche a cidade e o estado da viagem. */
export function VisitPlacePicker({ onSelect }: { onSelect: (place: VisitPlace) => void }) {
  const [places, setPlaces] = useState<VisitPlace[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => filterPlaces(places, query), [places, query]);

  const choose = (place: VisitPlace) => {
    onSelect(place);
    setQuery(place.label);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => event.key === 'ArrowDown'
        ? (current + 1) % suggestions.length
        : (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    let active = true;
    fetchAllPages((page) => visitApi.list({ page, limit: 100 }))
      .then((visits) => { if (active) setPlaces(groupVisitPlaces(visits)); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-2">
      <label htmlFor="visited-place-search" className="label">Destino já visitado (opcional)</label>
      <input
        id="visited-place-search"
        className="input"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'Carregando destinos…' : 'Busque por nome do lugar ou cidade'}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="visited-place-options"
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `visited-place-option-${activeIndex}` : undefined}
      />
      {open && suggestions.length > 0 && (
        <ul id="visited-place-options" role="listbox" className="max-h-52 overflow-auto rounded-lg border border-surface-200 bg-white shadow-lg">
          {suggestions.map((place, index) => (
            <li
              key={place.key}
              id={`visited-place-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={`cursor-pointer px-3 py-2 text-sm text-surface-800 hover:bg-surface-100 ${activeIndex === index ? 'bg-surface-100' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(place)}
            >
              {place.label}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        {failed ? 'Não foi possível carregar os destinos anteriores.' : 'Ao escolher, preenche cidade e estado. O nome do roteiro continua sendo informado acima.'}
      </p>
    </div>
  );
}

/** Lista de textos curtos: digite e aperte Enter (ou "Adicionar"). */
export function ArrayInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (val: string[]) => void; placeholder: string }) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    const text = newItem.trim();
    if (!text) return;
    onChange([...value, text]);
    setNewItem('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          className="input flex-1 min-w-0"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder={placeholder}
        />
        <Button onClick={handleAdd} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>Adicionar</Button>
      </div>
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((item, index) => (
            <li key={`${item}-${index}`} className="flex items-center gap-2 bg-surface-50 border border-surface-200 rounded-lg pl-3">
              <span className="flex-1 text-sm text-surface-800 py-2 break-words min-w-0">{item}</span>
              <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remover: ${item}`}>
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type MediaItem = { src: string; alt: string; focus?: string; type?: 'image' | 'video' };

const VIDEO_EXT = /\.(mp4|webm|mov)(\?.*)?$/i;

/** Fotos da viagem. A primeira é a capa. */
export function MediaInput({ value, onChange, inputId }: { value: MediaItem[]; onChange: (val: MediaItem[]) => void; inputId: string }) {
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
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          className="input flex-1 min-w-0"
          placeholder="Cole o link da foto (ex.: assets/images/pasta/foto.jpg)"
          aria-label="Link da foto"
          value={newSrc}
          onChange={(e) => setNewSrc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
        />
        <Button variant="primary" onClick={handleAdd} icon={<ImagePlus className="w-4 h-4" aria-hidden="true" />}>
          <span className="hidden sm:inline">Adicionar foto</span><span className="sm:hidden">Adicionar</span>
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-surface-600">Nenhuma foto ainda. A primeira que você adicionar vira a capa.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((item, index) => (
            <li key={index} className="p-2 bg-surface-50 rounded-lg border border-surface-200">
              <div className="flex items-center gap-2">
                <ImageThumb src={item.src} />
                <input type="text" className="input flex-1 min-w-0" value={item.src} onChange={(e) => update(index, { src: e.target.value })} aria-label={`Link da foto ${index + 1}`} />
                {index === 0 ? (
                  <span className="badge badge-info shrink-0">Capa</span>
                ) : (
                  <button type="button" className="btn-icon shrink-0" onClick={() => onChange([value[index], ...value.filter((_, i) => i !== index)])} aria-label={`Usar a foto ${index + 1} como capa`} title="Usar como capa">
                    <Star className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
                {item.type === 'video' && <span className="badge badge-info shrink-0">Vídeo</span>}
                <button type="button" className="btn-icon text-red-700 hover:bg-red-50 shrink-0" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remover foto ${index + 1}`}>
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <details className="mt-1 ml-14 text-sm">
                <summary className="cursor-pointer text-surface-600 py-1">Descrição da foto (opcional)</summary>
                <input type="text" className="input mt-1" value={item.alt} onChange={(e) => update(index, { alt: e.target.value })} placeholder="Se ficar vazia, usamos o nome da viagem" aria-label={`Descrição da foto ${index + 1} (opcional)`} />
                {item.focus !== undefined && (
                  <input type="text" className="input mt-1" value={item.focus} onChange={(e) => update(index, { focus: e.target.value })} placeholder="Parte da foto em destaque" aria-label={`Parte da foto ${index + 1} em destaque`} />
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type Departure = { time: string; place: string; city: string; mapsUrl?: string | null; mapsQuery?: string | null; orderIndex: number };

/** Lugares de onde o grupo sai, cada um com seu horário. */
export function DeparturesInput({ value, onChange }: { value: Departure[]; onChange: (val: Departure[]) => void }) {
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [city, setCity] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [mapsQuery, setMapsQuery] = useState('');
  const [missing, setMissing] = useState(false);

  const handleAdd = () => {
    if (!time.trim() || !place.trim() || !city.trim()) { setMissing(true); return; }
    onChange([...value, { time: time.trim(), place: place.trim(), city: city.trim(), mapsUrl: mapsUrl.trim() || undefined, mapsQuery: mapsQuery.trim() || undefined, orderIndex: value.length }]);
    setTime(''); setPlace(''); setCity(''); setMapsUrl(''); setMapsQuery(''); setMissing(false);
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input type="text" className="input" placeholder="Horário (ex.: 06h00)" aria-label="Horário da saída" value={time} onChange={(e) => setTime(e.target.value)} onKeyDown={onEnter} />
        <input type="text" className="input" placeholder="Local (ex.: Shopping)" aria-label="Local da saída" value={place} onChange={(e) => setPlace(e.target.value)} onKeyDown={onEnter} />
        <input type="text" className="input" placeholder="Cidade" aria-label="Cidade da saída" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={onEnter} />
        <input type="url" className="input sm:col-span-1" placeholder="Link do Google Maps (opcional)" aria-label="Link do Google Maps (opcional)" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} onKeyDown={onEnter} />
        <input type="text" className="input" placeholder="Endereço no Google Maps (opcional)" aria-label="Endereço no Google Maps (opcional)" value={mapsQuery} onChange={(e) => setMapsQuery(e.target.value)} onKeyDown={onEnter} />
        <Button variant="primary" onClick={handleAdd} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>Adicionar saída</Button>
      </div>
      {missing && <p className="field-error" role="alert">Preencha horário, local e cidade para adicionar.</p>}
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((item, index) => (
            <li key={index} className="flex items-center gap-2 flex-wrap p-2 bg-surface-50 rounded-lg border border-surface-200">
              <span className="font-mono text-sm bg-white px-2 py-1 rounded border border-surface-200">{item.time}</span>
              <span className="text-sm font-medium text-surface-900">{item.place}</span>
              <span className="text-sm text-surface-600">{item.city}</span>
              {(item.mapsUrl || item.mapsQuery) && <span className="badge badge-info">Google Maps</span>}
              <button type="button" className="btn-icon ml-auto text-red-700 hover:bg-red-50" onClick={() => onChange(value.filter((_, i) => i !== index).map((d, i) => ({ ...d, orderIndex: i })))} aria-label={`Remover saída ${item.place} às ${item.time}`}>
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
