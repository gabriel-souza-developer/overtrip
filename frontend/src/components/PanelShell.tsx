import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, Menu as MenuIcon, User, X, type LucideIcon } from 'lucide-react';
import UserAccountMenu from './UserAccountMenu';

export interface PanelShellNavItem { path: string; label: string; icon: LucideIcon }
export interface PanelShellNavGroup { label: string; items: PanelShellNavItem[] }

export interface PanelShellProps {
  // Classe extra no container raiz: identidade visual por contexto (ex.: a
  // paleta própria de cada empresa em organization-theme.css). O OVERTRIP
  // não precisa de nenhuma, por isso é opcional.
  rootClassName?: string;
  // Variáveis CSS inline (ex.: a paleta própria da empresa, de
  // organizationBrand.ts): têm prioridade sobre o valor padrão da classe.
  rootStyle?: React.CSSProperties;
  // Bloco do topo do menu (logo+nome do OVERTRIP, ou iniciais+nome da
  // empresa): varia por contexto, mas ocupa o mesmo espaço nos dois.
  brand: React.ReactNode;
  navGroups: PanelShellNavGroup[];
  navAriaLabel: string;
  currentPageLabel: string;
  // Conteúdo extra no rodapé do menu, acima dos dados do usuário (ex.:
  // "Trocar empresa", que só existe no painel de agência).
  sidebarFooterExtra?: React.ReactNode;
  user: { name?: string; email?: string } | null | undefined;
  onLogout: () => void | Promise<void>;
  children: React.ReactNode;
}

// Casca comum aos dois painéis (OVERTRIP e agência): menu lateral,
// cabeçalho, responsividade e foco/acessibilidade.
export default function PanelShell({ rootClassName, rootStyle, brand, navGroups, navAriaLabel, currentPageLabel, sidebarFooterExtra, user, onLogout, children }: PanelShellProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const asideRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Marca se o menu móvel estava aberto no efeito anterior, para devolver o
  // foco ao botão "Abrir menu" só depois que `contentRef` deixar de ser
  // inert (focus() em elemento dentro de um container inert não funciona).
  const wasMobileOpenRef = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  // No celular, o menu fechado fica fora da tela e o conteúdo por trás dele
  // some do Tab/leitor de tela quando aberto: `inert` em cada lado, como um
  // diálogo modal (overlay + Esc já fecham; o foco é tratado abaixo).
  useEffect(() => {
    const mobileOpen = !isDesktop && sidebarOpen;
    asideRef.current?.toggleAttribute('inert', !isDesktop && !sidebarOpen);
    contentRef.current?.toggleAttribute('inert', mobileOpen);
    if (mobileOpen) asideRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
    else if (wasMobileOpenRef.current) menuButtonRef.current?.focus();
    wasMobileOpenRef.current = mobileOpen;
  }, [isDesktop, sidebarOpen]);
  // No celular com o menu aberto: Esc fecha (o foco volta ao botão "Abrir
  // menu" pelo efeito acima); Tab fica preso no menu (o conteúdo por trás já
  // está inert, mas o teclado também não deve escapar para fora do menu).
  useEffect(() => {
    if (!sidebarOpen || isDesktop) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSidebarOpen(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = asideRef.current?.querySelectorAll<HTMLElement>('button, a[href]');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen, isDesktop]);
  // Ao trocar de tela, o foco vai para o conteúdo (leitores de tela e teclado).
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const handleLogout = () => { void onLogout(); };

  return (
    <div className={`min-h-screen bg-surface-50${rootClassName ? ` ${rootClassName}` : ''}`} style={rootStyle}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg">Ir para o conteúdo</a>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <aside ref={asideRef} className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-surface-200 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Menu principal">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-5 py-5 border-b border-surface-200 gap-2">
            <div className="flex items-center gap-3 min-w-0">{brand}</div>
            <button type="button" className="btn-icon lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          <nav className="flex-1 px-3 py-5 overflow-y-auto" aria-label={navAriaLabel}>
            {navGroups.map(({ label: groupLabel, items }) => {
              if (!items.length) return null;
              return (
                <div key={groupLabel} className="mb-6 space-y-1">
                  <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-surface-600">{groupLabel}</p>
                  {items.map(({ path, label, icon: Icon }) => (
                    <NavLink key={path} to={path} className={({ isActive }) => `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${isActive ? (rootClassName === 'agency-panel' ? 'bg-primary-600 text-white shadow-sm' : 'bg-primary-50 text-primary-800') : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'}`} onClick={() => setSidebarOpen(false)}>
                      <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />{label}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="p-3 border-t border-surface-200">
            {sidebarFooterExtra}
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-primary-800" aria-hidden="true" /></div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-surface-900 truncate">{user?.name}</p><p className="text-xs text-surface-600 truncate">{user?.email}</p></div>
            </div>
            <button type="button" className="btn-ghost w-full justify-start mt-1" onClick={handleLogout}><LogOut className="w-4 h-4" aria-hidden="true" /> Sair</button>
          </div>
        </div>
      </aside>
      <div ref={contentRef} className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b border-surface-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 gap-1">
            <button ref={menuButtonRef} type="button" className="btn-icon lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" aria-expanded={sidebarOpen}><MenuIcon className="w-6 h-6" aria-hidden="true" /></button>
            <div className="flex-1 min-w-0 pl-2 lg:pl-0"><p className="text-sm font-semibold text-surface-900 truncate">{currentPageLabel}</p></div>
            <UserAccountMenu user={user} onLogout={handleLogout} />
          </div>
        </header>
        <main id="conteudo" ref={mainRef} tabIndex={-1} className="p-4 sm:p-6 lg:p-8 max-w-7xl outline-none">
          <React.Suspense fallback={<div className="flex justify-center py-16" role="status" aria-label="Carregando"><div className="spinner w-8 h-8" /></div>}>
            {children}
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}
