import { useEffect } from 'react';

/** Título da aba por seção: "OVERTRIP - NOME DA SEÇÃO". Restaura o anterior ao desmontar. */
export function useDocumentTitle(section: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `OVERTRIP - ${section.toUpperCase()}`;
    return () => { document.title = previous; };
  }, [section]);
}
