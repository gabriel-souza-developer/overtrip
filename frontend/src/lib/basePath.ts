/** Base do painel: '/' no dev, '/admin/' no build de produção (vem do Vite). */
const DEFAULT_BASE = import.meta.env?.BASE_URL ?? '/';

/** Basename do BrowserRouter: sem barra final ('/admin'); '/' na raiz. */
export function routerBasename(base: string = DEFAULT_BASE): string {
  return base.length > 1 ? base.replace(/\/+$/, '') : '/';
}

/** URL de um arquivo de public/brand respeitando a base. */
export function brandUrl(file: string, base: string = DEFAULT_BASE): string {
  return `${base.endsWith('/') ? base : base + '/'}brand/${file}`;
}
