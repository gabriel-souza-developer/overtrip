import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Building2, ChevronDown, House, Images, LogOut, MapPinned, Menu as MenuIcon, Plane, Ticket, User, UsersRound, X } from 'lucide-react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useToast } from '../hooks/useToast';
import { organizationApi, type OrganizationContext } from '../api/organizations';
import { useAuth } from '../App';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ChangePasswordDialog from '../components/ChangePasswordDialog';

export interface OrganizationOutletContext { organization: OrganizationContext['organization']; role: string }

const CAN_VIEW_PRIVATE_DATA = (role: string) => role === 'OWNER' || role === 'ADMIN';

export default function OrganizationLayout() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const asideRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [context, setContext] = useState<OrganizationContext | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const requestVersion = useRef(0);

  const load = async () => {
    if (!organizationId) return;
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const result = await organizationApi.get(organizationId);
      if (version === requestVersion.current) setContext(result);
    } catch (err) {
      if (version === requestVersion.current) {
        setContext(null);
        setError(err instanceof Error ? err.message : 'Não foi possível carregar esta empresa.');
      }
    } finally { if (version === requestVersion.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [organizationId]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    asideRef.current?.toggleAttribute('inert', !isDesktop && !sidebarOpen);
    if (!isDesktop && sidebarOpen) asideRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
  }, [isDesktop, sidebarOpen, context, loading]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSidebarOpen(false); menuButtonRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname, loading]);

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); }
    catch { navigate('/login'); toast.error('Sessão removida deste navegador, mas não foi possível confirmar o encerramento no servidor.'); }
  };

  if (loading || (context && context.organization.id !== organizationId)) return <div className="min-h-screen flex items-center justify-center"><div className="spinner w-8 h-8" /></div>;

  if (error || !context) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
        <div className="w-full max-w-md space-y-4">
          <ErrorState message={error || 'Empresa não encontrada.'} onRetry={() => void load()} />
          <Button onClick={() => setPasswordOpen(true)} className="w-full justify-center">Trocar senha</Button>
          <Link to="/empresa" state={{ selectOrganization: true }} className="btn-secondary w-full justify-center">Voltar para a lista de empresas</Link>
          <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
        </div>
      </div>
    );
  }

  const canViewPrivateData = CAN_VIEW_PRIVATE_DATA(context.role);
  const navItems = [
    { path: 'dashboard', label: 'Início', icon: House },
    { path: 'trips', label: 'Viagens', icon: Plane },
    { path: 'visits', label: 'Destinos visitados', icon: MapPinned },
    ...(canViewPrivateData ? [
      { path: 'leads', label: 'Interessados', icon: UsersRound },
      { path: 'reservations', label: 'Reservas', icon: Ticket },
    ] : []),
    { path: 'gallery', label: 'Galeria de memórias', icon: Images },
  ];

  const currentPage = navItems.find(item => location.pathname.endsWith(`/${item.path}`))?.label ?? 'Painel';

  return (
    <div className="min-h-screen bg-surface-50">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg">Ir para o conteúdo</a>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <aside ref={asideRef} className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-surface-200 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Menu principal">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-5 py-5 border-b border-surface-200 gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"><Building2 className="w-6 h-6" aria-hidden="true" /></span>
              <div className="min-w-0"><p className="text-sm font-bold tracking-wide text-surface-900 truncate" title={context.organization.name}>{context.organization.name}</p><p className="mt-0.5 text-xs text-surface-600">Painel de gestão</p></div>
            </div>
            <button type="button" className="btn-icon lg:hidden" onClick={() => { setSidebarOpen(false); menuButtonRef.current?.focus(); }} aria-label="Fechar menu"><X className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Navegação da empresa">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-surface-600">Operação</p>
            {navItems.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} className={({ isActive }) => `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${isActive ? 'bg-primary-50 text-primary-600' : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'}`} onClick={() => setSidebarOpen(false)}><Icon className="w-5 h-5 shrink-0" aria-hidden="true" />{label}</NavLink>)}
          </nav>
          <div className="p-3 border-t border-surface-200">
            <Link to="/empresa" state={{ selectOrganization: true }} className="btn-ghost w-full justify-start" onClick={() => setSidebarOpen(false)}><Building2 className="w-4 h-4" aria-hidden="true" /> Trocar empresa</Link>
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-primary-500" aria-hidden="true" /></div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-surface-900 truncate">{user?.name}</p><p className="text-xs text-surface-600 truncate">{user?.email}</p></div>
            </div>
            <button type="button" className="btn-ghost w-full justify-start mt-1" onClick={() => void handleLogout()}><LogOut className="w-4 h-4" aria-hidden="true" /> Sair</button>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b border-surface-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 gap-1">
            <button ref={menuButtonRef} type="button" className="btn-icon lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" aria-expanded={sidebarOpen}><MenuIcon className="w-6 h-6" aria-hidden="true" /></button>
            <div className="flex-1 min-w-0 pl-2 lg:pl-0"><p className="text-sm font-semibold text-surface-900 truncate">{currentPage}</p></div>
            <Button small onClick={() => setPasswordOpen(true)}>Trocar senha</Button>
            <Menu.Root>
              <Menu.Trigger className="flex items-center gap-2 px-2 py-1.5 min-h-[44px] rounded-lg text-surface-700 hover:bg-surface-100" aria-label="Minha conta">
                <span className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center"><User className="w-5 h-5 text-primary-500" aria-hidden="true" /></span>
                <span className="hidden sm:block text-sm font-medium">{user?.name}</span><ChevronDown className="w-4 h-4 hidden sm:block" aria-hidden="true" />
              </Menu.Trigger>
              <Menu.Portal><Menu.Content className="menu-content" align="end" sideOffset={4}>
                <div className="px-3 py-2 border-b border-surface-200 mb-1"><p className="text-sm font-medium text-surface-900">{user?.name}</p><p className="text-xs text-surface-600 break-all">{user?.email}</p></div>
                <Menu.Item className="menu-item" onSelect={() => setPasswordOpen(true)}>Trocar senha</Menu.Item>
                <Menu.Item className="menu-item" onSelect={() => void handleLogout()}><LogOut className="w-4 h-4" aria-hidden="true" /> Sair</Menu.Item>
              </Menu.Content></Menu.Portal>
            </Menu.Root>
          </div>
        </header>
        <main id="conteudo" ref={mainRef} tabIndex={-1} className="p-4 sm:p-6 lg:p-8 max-w-7xl outline-none">
          <React.Suspense fallback={<div className="flex justify-center py-16" role="status" aria-label="Carregando"><div className="spinner w-8 h-8" /></div>}>
            <Outlet key={context.organization.id} context={{ organization: context.organization, role: context.role } satisfies OrganizationOutletContext} />
          </React.Suspense>
        </main>
      </div>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
