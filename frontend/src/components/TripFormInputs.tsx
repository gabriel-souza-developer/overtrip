import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Star, X } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { isValidTripMediaSrc, IMAGE_SRC_MESSAGE, isUploadedVideoSrc, isUploadedMediaSrc } from '../lib/imageSrc';
import { locationMapUrl, LocationResult, parseLocationResults } from '../lib/locationSearch';
import ImageThumb from './ImageThumb';
import ImageUploader from './ImageUploader';
import Button from './Button';
import { imageSourceLabel } from '../lib/assetUrl';
import { DEPARTURE_PRESETS } from '../lib/tripFormOptions';

/** Pesquisa um endereço no Photon (serviço de geocodificação de terceiro, sem chave de API). */
async function searchPhoton(query: string, signal: AbortSignal): Promise<LocationResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.search = new URLSearchParams({ q: query, limit: '5' }).toString();
  const response = await fetch(url.toString(), { signal });
  if (!response.ok) throw new Error('Serviço de pesquisa indisponível. Tente novamente.');
  return parseLocationResults(await response.json());
}

/** Pesquisa de local reutilizável: busca no Photon, mostra resultados e só usa a coordenada quando a pessoa confirma. */
export function LocationPicker({ coords, onConfirm, onClear }: { coords: { lat: number; lng: number } | null; onConfirm: (result: LocationResult) => void; onClear?: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const search = async () => {
    const text = query.trim();
    if (text.length < 3) { setError('Digite pelo menos três caracteres.'); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const found = await searchPhoton(text, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      if (!found.length) setError('Nenhum local encontrado. Experimente outro nome ou inclua a cidade.');
    } catch {
      if (!controller.signal.aborted) setError('Não foi possível pesquisar agora. Tente novamente.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-surface-200 p-3">
      <p className="text-xs text-surface-600">Busca opcional; o texto digitado é enviado ao Photon, serviço externo à OVERTRIP.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          className="input flex-1 min-w-0"
          aria-label="Pesquisar local no mapa"
          placeholder="Endereço, ponto de referência ou cidade"
          value={query}
          onChange={(e) => { request.current?.abort(); setSearching(false); setQuery(e.target.value); setResults([]); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!searching) void search(); } }}
        />
        <Button loading={searching} loadingText="Pesquisando..." onClick={search}>Pesquisar</Button>
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {results.length > 0 && (
        <ul className="space-y-2" aria-label="Resultados da pesquisa">
          {results.map((result, index) => (
            <li key={`${result.lat}-${result.lng}-${index}`} className="rounded border border-surface-200 p-2 text-sm space-y-1">
              <p>{result.label}</p>
              <p className="text-surface-600">{result.lat}, {result.lng}</p>
              <div className="flex flex-wrap items-center gap-3">
                <a className="text-primary-800 underline" href={locationMapUrl(result.lat, result.lng)} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
                <Button small onClick={() => { onConfirm(result); setResults([]); }}>Usar esta localização</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {coords && <div className="flex flex-wrap items-center gap-4 text-sm"><a className="text-primary-800 underline" href={locationMapUrl(coords.lat, coords.lng)} target="_blank" rel="noopener noreferrer">Ver localização confirmada no mapa</a>{onClear && <button type="button" className="text-primary-600 underline" onClick={onClear}>Remover coordenadas</button>}</div>}
    </div>
  );
}

export function ArrayInput({ id, value, onChange, placeholder, onPendingChange }: { id: string; value: string[]; onChange: (val: string[]) => void; placeholder: string; onPendingChange?: (pending: boolean) => void }) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    const text = newItem.trim();
    if (!text) return;
    onChange([...value, text]);
    setNewItem('');
    onPendingChange?.(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          className="input flex-1 min-w-0"
          value={newItem}
          onChange={(e) => { setNewItem(e.target.value); onPendingChange?.(!!e.target.value.trim()); }}
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
export function MediaInput({ value, onChange, inputId, onPendingChange, onLinkPendingChange }: { value: MediaItem[]; onChange: (val: MediaItem[]) => void; inputId: string; onPendingChange?: (pending: boolean) => void; onLinkPendingChange?: (pending: boolean) => void }) {
  const { toast } = useToast();
  const [newSrc, setNewSrc] = useState('');
  const [editingSrcIndex, setEditingSrcIndex] = useState<number | null>(null);

  const handleAdd = () => {
    const src = newSrc.trim();
    if (!src) return;
    if (!isValidTripMediaSrc(src)) { toast.error(IMAGE_SRC_MESSAGE); return; }
    onChange([...value, { src, alt: '', type: VIDEO_EXT.test(src) ? 'video' : 'image' }]);
    setNewSrc('');
    onLinkPendingChange?.(false);
  };

  const update = (index: number, patch: Partial<MediaItem>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-3">
      <ImageUploader allowVideo idPrefix={`${inputId}-upload`} onPendingChange={onPendingChange} onAdd={(item) => onChange([...value, item])} />
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          className="input flex-1 min-w-0"
          placeholder="Cole o endereço público da foto ou vídeo"
          aria-label="Endereço público da foto ou vídeo"
          value={newSrc}
          onChange={(e) => { setNewSrc(e.target.value); onLinkPendingChange?.(!!e.target.value.trim()); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
        />
        <Button variant="primary" onClick={handleAdd} icon={<ImagePlus className="w-4 h-4" aria-hidden="true" />}>
          <span className="hidden sm:inline">Adicionar foto ou vídeo</span><span className="sm:hidden">Adicionar</span>
        </Button>
      </div>
      <p className="hint">Vídeo: MP4 H.264, até 15 MiB e 5 minutos. Links MP4, WebM ou MOV também são aceitos.</p>
      {value.length === 0 ? (
        <p className="text-sm text-surface-600">Nenhuma foto ou vídeo adicionado.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((item, index) => (
            <li key={index} className="p-2 bg-surface-50 rounded-lg border border-surface-200">
              <div className="flex items-center gap-2">
                {item.type === 'video' ? <video controls preload="metadata" src={isUploadedVideoSrc(item.src) ? item.src.replace('/api/public/media/', '/api/media/') : item.src} aria-label={item.alt || 'Prévia do vídeo'} className="w-24 h-16 rounded shrink-0" /> : <ImageThumb src={item.src} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-surface-800">{imageSourceLabel(item.src)}</p>
                  <button type="button" className="mt-1 text-xs font-semibold text-surface-700 hover:underline" aria-expanded={editingSrcIndex === index} onClick={() => setEditingSrcIndex(editingSrcIndex === index ? null : index)}>
                    {editingSrcIndex === index ? 'Fechar endereço' : `Alterar endereço ${item.type === 'video' ? 'do vídeo' : 'da foto'}`}
                  </button>
                </div>
                {item.type !== 'video' && (index === value.findIndex(media => media.type !== 'video') ? (
                  <span className="badge badge-info shrink-0">Capa</span>
                ) : (
                  <button type="button" className="btn-icon shrink-0" onClick={() => onChange([value[index], ...value.filter((_, i) => i !== index)])} aria-label={`Usar a foto ${index + 1} como capa`} title="Usar como capa">
                    <Star className="w-4 h-4" aria-hidden="true" />
                  </button>
                ))}
                {item.type === 'video' && <span className="badge badge-info shrink-0">Vídeo</span>}
                <button type="button" className="btn-icon text-red-700 hover:bg-red-50 shrink-0" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remover ${item.type === 'video' ? 'vídeo' : 'foto'} ${index + 1}`}>
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              {editingSrcIndex === index && <input type="text" className="input mt-2" value={item.src} onChange={(e) => update(index, { src: e.target.value, type: VIDEO_EXT.test(e.target.value) ? 'video' : 'image' })} aria-label={`Endereço ${item.type === 'video' ? 'do vídeo' : 'da foto'} ${index + 1}`} />}
              {(isUploadedMediaSrc(item.src) || isUploadedVideoSrc(item.src)) ? (
                <div className="mt-1 ml-14 text-sm">
                  <label className="label" htmlFor={`${inputId}-alt-${index}`}>O que aparece {item.type === 'video' ? 'neste vídeo' : 'nesta foto'}? <span className="text-red-700">(obrigatório)</span></label>
                  <input id={`${inputId}-alt-${index}`} type="text" className={`input ${item.alt.trim() ? '' : 'border-red-500'}`} value={item.alt} aria-required="true" aria-invalid={!item.alt.trim()} onChange={(e) => update(index, { alt: e.target.value })} placeholder="Ex.: Grupo atravessando o rio na trilha" aria-label={`O que aparece ${item.type === 'video' ? 'no vídeo' : 'na foto'} ${index + 1}? (obrigatório)`} />
                  <p className="hint mt-1">Ajuda leitores de tela a descrever a imagem.</p>
                </div>
              ) : (
              <div className="mt-2 ml-14 text-sm">
                <label className="label" htmlFor={`${inputId}-alt-${index}`}>O que aparece {item.type === 'video' ? 'neste vídeo' : 'nesta foto'}? <span className="font-normal text-surface-500">(opcional)</span></label>
                <input id={`${inputId}-alt-${index}`} type="text" className="input" value={item.alt} onChange={(e) => update(index, { alt: e.target.value })} placeholder="Ex.: Rio cercado por árvores" aria-label={`O que aparece ${item.type === 'video' ? 'no vídeo' : 'na foto'} ${index + 1}? (opcional)`} />
                <p className="hint mt-1">Sem descrição, o site usa o nome da viagem.</p>
                {item.focus !== undefined && (
                  <input type="text" className="input mt-2" value={item.focus} onChange={(e) => update(index, { focus: e.target.value })} placeholder="Parte da foto em destaque" aria-label={`Parte da foto ${index + 1} em destaque`} />
                )}
              </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type Departure = { time: string; place: string; city: string; mapsUrl?: string | null; mapsQuery?: string | null; lat?: number | null; lng?: number | null; orderIndex: number };

/** Lugares de onde o grupo sai, cada um com seu horário. */
export function DeparturesInput({ value, onChange, onPendingChange, seed }: { value: Departure[]; onChange: (val: Departure[]) => void; onPendingChange?: (pending: boolean) => void; seed?: { place: string; city: string; mapsQuery: string; lat: number | null; lng: number | null; requestId: number } | null }) {
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [city, setCity] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [mapsQuery, setMapsQuery] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPickerVersion, setLocationPickerVersion] = useState(0);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!seed) return;
    setTime(''); setPlace(seed.place); setCity(seed.city); setMapsQuery(seed.mapsQuery); setMapsUrl('');
    setCoords(seed.lat != null && seed.lng != null ? { lat: seed.lat, lng: seed.lng } : null);
    setLocationPickerVersion(version => version + 1);
    setMissing(false);
    onPendingChange?.(true);
  }, [seed]);

  const updatePlaceText = (setter: (value: string) => void, value: string) => {
    setter(value);
    setCoords(null);
    setLocationPickerVersion(version => version + 1);
  };

  const handleAdd = () => {
    if (!time.trim() || !place.trim() || !city.trim()) { setMissing(true); return; }
    onChange([...value, { time: time.trim(), place: place.trim(), city: city.trim(), mapsUrl: mapsUrl.trim() || undefined, mapsQuery: mapsQuery.trim() || undefined, lat: coords?.lat ?? undefined, lng: coords?.lng ?? undefined, orderIndex: value.length }]);
    setTime(''); setPlace(''); setCity(''); setMapsUrl(''); setMapsQuery(''); setCoords(null); setMissing(false);
    onPendingChange?.(false);
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-surface-700">
        Local frequente
        <select className="input mt-1" value="" onChange={(event) => {
          const preset = DEPARTURE_PRESETS.find(item => item.label === event.target.value);
          if (!preset) return;
          setPlace(preset.point); setCity(preset.city); setMapsQuery(preset.mapsQuery);
          setMapsUrl(''); setCoords(null); setLocationPickerVersion(version => version + 1);
          onPendingChange?.(true);
        }}>
          <option value="">Escolha um local ou preencha abaixo</option>
          {DEPARTURE_PRESETS.map(preset => <option key={preset.label} value={preset.label}>{preset.label}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" onInput={(event) => onPendingChange?.(Array.from(event.currentTarget.querySelectorAll('input')).some((input) => !!input.value.trim()))}>
        <input type="text" className="input" placeholder="Horário (ex.: 06h00)" aria-label="Horário da saída" value={time} onChange={(e) => setTime(e.target.value)} onKeyDown={onEnter} />
        <input type="text" className="input" placeholder="Local (ex.: Shopping)" aria-label="Local da saída" value={place} onChange={(e) => updatePlaceText(setPlace, e.target.value)} onKeyDown={onEnter} />
        <input type="text" className="input" placeholder="Cidade" aria-label="Cidade da saída" value={city} onChange={(e) => updatePlaceText(setCity, e.target.value)} onKeyDown={onEnter} />
        <input type="url" className="input sm:col-span-1" placeholder="Link do Google Maps (opcional)" aria-label="Link do Google Maps (opcional)" value={mapsUrl} onChange={(e) => updatePlaceText(setMapsUrl, e.target.value)} onKeyDown={onEnter} />
        <input type="text" className="input" placeholder="Endereço no Google Maps (opcional)" aria-label="Endereço no Google Maps (opcional)" value={mapsQuery} onChange={(e) => updatePlaceText(setMapsQuery, e.target.value)} onKeyDown={onEnter} />
      </div>
      <LocationPicker key={locationPickerVersion} coords={coords} onConfirm={(result) => setCoords({ lat: result.lat, lng: result.lng })} onClear={() => setCoords(null)} />
      <Button variant="primary" onClick={handleAdd} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>Adicionar saída</Button>
      {(time || place || city || mapsUrl || mapsQuery || coords) && <button type="button" className="btn-secondary btn-sm ml-2" onClick={() => {
        setTime(''); setPlace(''); setCity(''); setMapsUrl(''); setMapsQuery(''); setCoords(null); setMissing(false);
        setLocationPickerVersion(version => version + 1);
        onPendingChange?.(false);
      }}>Descartar preenchimento</button>}
      {missing && <p className="field-error" role="alert">Preencha horário, local e cidade para adicionar.</p>}
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((item, index) => (
            <li key={index} className="flex items-center gap-2 flex-wrap p-2 bg-surface-50 rounded-lg border border-surface-200">
              <span className="font-mono text-sm bg-white px-2 py-1 rounded border border-surface-200">{item.time}</span>
              <span className="text-sm font-medium text-surface-900">{item.place}</span>
              <span className="text-sm text-surface-600">{item.city}</span>
              {(item.mapsUrl || item.mapsQuery) && <span className="badge badge-info">Google Maps</span>}
              {typeof item.lat === 'number' && typeof item.lng === 'number' && <span className="badge badge-info">Mapa confirmado</span>}
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
