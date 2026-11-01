import React from 'react';
import { Search } from 'lucide-react';
import Button from './Button';

interface FilterBarProps {
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearch: (value: string) => void;
  /** Selects de filtro (aplicam ao escolher). */
  children?: React.ReactNode;
  onClear?: () => void;
  hasFilters: boolean;
}

/** Busca (com botão, não só Enter) + filtros + "Limpar". */
export default function FilterBar({ searchLabel, searchPlaceholder, searchValue, onSearch, children, onClear, hasFilters }: FilterBarProps) {
  return (
    <div className="card p-4">
      <form
        key={searchValue}
        role="search"
        className="flex flex-col lg:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(String(new FormData(e.currentTarget).get('search') ?? '').trim());
        }}
      >
        <div className="flex-1 min-w-0 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" aria-hidden="true" />
          <input type="search" name="search" className="input !pl-10" placeholder={searchPlaceholder} defaultValue={searchValue} aria-label={searchLabel} />
        </div>
        {children}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="flex-1 lg:flex-none">Buscar</Button>
          {hasFilters && onClear ? <Button onClick={onClear}>Limpar</Button> : null}
        </div>
      </form>
    </div>
  );
}
