import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Estado,
  createEstadosCache,
  createMunicipioCache,
  debounce,
  fetchEstados,
  fetchMunicipios,
  filterMunicipios,
} from '../lib/ibgeLocalidades';
import { buildUfOptions, nextActiveIndex } from '../lib/locationCombobox';

// Shared across every UfSelect/CityAutocomplete instance on the page so the
// two forms (TripForm, Visits) and repeated renders don't refetch the same UF.
const municipioCache = createMunicipioCache(fetchMunicipios);

const estadosCache = createEstadosCache(fetchEstados);

/** estados === null while loading; failed only after a real fetch failure. */
export function useEstados() {
  const [estados, setEstados] = useState<Estado[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    estadosCache.get().then(result => {
      if (!active) return;
      if (result) setEstados(result);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { estados, failed };
}

interface UfSelectProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Renders a <select> of the 27 UFs (label = nome, value = sigla, matching
 * the 'region' column's storage convention). Disabled while loading; falls
 * back to a literal free-text input only if the IBGE estados API fails.
 */
export function UfSelect({ id, name, value, onChange, required, disabled, className = 'select' }: UfSelectProps) {
  const { estados, failed } = useEstados();

  if (failed) {
    return (
      <input
        id={id}
        name={name}
        className={className.includes('select') ? 'input' : className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Estado"
        required={required}
        disabled={disabled}
      />
    );
  }

  if (estados === null) {
    return (
      <select id={id} name={name} className={className} value="" disabled required={required}>
        <option value="">Carregando…</option>
      </select>
    );
  }

  return (
    <select
      id={id}
      name={name}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
    >
      <option value="">Selecione o estado</option>
      {buildUfOptions(estados, value).map(estado => (
        <option key={estado.sigla} value={estado.sigla}>{estado.nome}</option>
      ))}
    </select>
  );
}

interface CityAutocompleteProps {
  id: string;
  name: string;
  value: string;
  uf: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}

/**
 * Free-text <input> for the city that, once a UF is chosen, shows a
 * debounced (300ms) suggestion list fetched (and cached) per UF from the
 * IBGE municipios API. Any fetch failure leaves it as a plain text input.
 * Implements the combobox/listbox pattern; suggestions are position:fixed so
 * scrolling containers (e.g. .table-container) can't clip them.
 */
export function CityAutocomplete({ id, name, value, uf, onChange, required, className = 'input' }: CityAutocompleteProps) {
  const [municipios, setMunicipios] = useState<string[] | null>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const debouncedSetQuery = useMemo(() => debounce((q: string) => setQuery(q), 300), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;

  useEffect(() => () => debouncedSetQuery.cancel(), [debouncedSetQuery]);

  useEffect(() => {
    setMunicipios(null);
    if (!uf || uf.length !== 2) return;
    let active = true;
    municipioCache.get(uf).then(result => {
      if (active) setMunicipios(result);
    });
    return () => {
      active = false;
    };
  }, [uf]);

  const suggestions = useMemo(() => {
    if (!municipios) return [];
    return filterMunicipios(municipios, query).slice(0, 8);
  }, [municipios, query]);

  const showSuggestions = open && municipios !== null && municipios.length > 0 && suggestions.length > 0;

  useEffect(() => {
    if (!showSuggestions) return;
    const update = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showSuggestions]);

  const choose = (city: string) => {
    debouncedSetQuery.cancel();
    onChange(city);
    setQuery(city);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex(nextActiveIndex(activeIndex, suggestions.length, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      if (showSuggestions && activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        choose(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      if (showSuggestions) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          debouncedSetQuery(e.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listId}
        aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        placeholder={!uf ? 'Cidade (selecione o estado para sugestões)' : 'Digite para buscar'}
        required={required}
        autoComplete="off"
      />
      {showSuggestions && rect && (
        <ul
          id={listId}
          role="listbox"
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 bg-white border border-surface-200 rounded-lg shadow-lg max-h-56 overflow-auto"
        >
          {suggestions.map((city, index) => (
            <li
              key={city}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              className={`w-full text-left px-3 py-2 text-sm cursor-pointer hover:bg-surface-50 ${index === activeIndex ? 'bg-surface-50' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(city)}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
