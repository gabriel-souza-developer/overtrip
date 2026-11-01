import { useSearchParams } from 'react-router-dom';

/** Filtros e página guardados no endereço (o botão Voltar e links diretos funcionam). */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setSearchParams(next);
  };

  const setPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
  };

  const clear = () => setSearchParams(new URLSearchParams());

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  return { searchParams, page, get: (key: string) => searchParams.get(key) || '', setFilter, setPage, clear };
}
