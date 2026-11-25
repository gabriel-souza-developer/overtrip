import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Building2, House, Images, MapPinned, Plane, Settings as SettingsIcon, Share2, Ticket, UsersRound } from 'lucide-react';
import { organizationApi, type OrganizationContext } from '../api/organizations';
import { useAuth } from '../App';
import { useToast } from '../hooks/useToast';
import { getOrganizationPalette } from '../lib/organizationBrand';
import ErrorState from '../components/ErrorState';
import UserAccountMenu from '../components/UserAccountMenu';
import PanelShell, { type PanelShellNavGroup } from '../components/PanelShell';

// `updateOrganization` deixa a página de Configurações aplicar, sem um
// segundo GET, o objeto que o próprio PUT devolveu: evita que outra página
// (ex.: o prefill de nova viagem em OrganizationTrips.tsx) continue lendo o
// valor antigo até a próxima troca de rota.
export interface OrganizationOutletContext { organization: OrganizationContext['organization']; role: string; updateOrganization: (next: OrganizationContext['organization']) => void }

const CAN_VIEW_PRIVATE_DATA = (role: string) => role === 'OWNER' || role === 'ADMIN';

export default function OrganizationLayout() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [context, setContext] = useState<OrganizationContext | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const updateOrganization = useCallback((next: OrganizationContext['organization']) => {
    setContext((prev) => (prev ? { ...prev, organization: next } : prev));
  }, []);

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

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); }
    catch { navigate('/login'); toast.error('Sessão removida deste navegador, mas não foi possível confirmar o encerramento no servidor.'); }
  };

  if (loading || (context && context.organization.id !== organizationId)) return <div className="min-h-screen flex items-center justify-center"><div className="spinner w-8 h-8" /></div>;

  if (error || !context) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
        <div className="w-full max-w-md space-y-4">
          <div className="flex justify-end"><UserAccountMenu user={user} onLogout={handleLogout} /></div>
          <ErrorState message={error || 'Empresa não encontrada.'} onRetry={() => void load()} />
          <Link to="/empresa" state={{ selectOrganization: true }} className="btn-secondary w-full justify-center">Voltar para a lista de empresas</Link>
        </div>
      </div>
    );
  }

  const canViewPrivateData = CAN_VIEW_PRIVATE_DATA(context.role);
  const initials = context.organization.name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('pt-BR');
  const palette = getOrganizationPalette(context.organization);
  // Mesma convenção estrutural do menu do OVERTRIP (Layout.tsx): operação de
  // um lado, itens administrativos de outro (aqui, só Configurações, já que
  // Interessados/Reservas/Redes sociais seguem no grupo de operação mesmo
  // exigindo OWNER/ADMIN, como lá) — e mesma ordem dentro de "Operação"
  // (Interessados, Reservas, Redes sociais, Galeria de memórias).
  const navGroups: PanelShellNavGroup[] = [
    {
      label: 'Operação',
      items: [
        { path: 'dashboard', label: 'Início', icon: House },
        { path: 'trips', label: 'Viagens', icon: Plane },
        { path: 'visits', label: 'Destinos visitados', icon: MapPinned },
        ...(canViewPrivateData ? [
          { path: 'leads', label: 'Interessados', icon: UsersRound },
          { path: 'reservations', label: 'Reservas', icon: Ticket },
          // Divulgação é informação sensível como Interessados/Reservas: mesmo
          // gate (OWNER/ADMIN), reforçado no servidor em organizationSocialPostRoutes.ts.
          { path: 'social-posts', label: 'Redes sociais', icon: Share2 },
        ] : []),
        { path: 'gallery', label: 'Galeria de memórias', icon: Images },
      ],
    },
    {
      label: 'Administração',
      items: canViewPrivateData ? [{ path: 'settings', label: 'Configurações', icon: SettingsIcon }] : [],
    },
  ];
  const flatNavItems = navGroups.flatMap((group) => group.items);
  const currentPage = flatNavItems.find(item => location.pathname.endsWith(`/${item.path}`))?.label ?? 'Painel';

  return (
    <PanelShell
      rootClassName="agency-panel"
      rootStyle={palette as React.CSSProperties}
      brand={<>
        <span className="w-12 h-12 rounded-xl bg-primary-50 text-primary-800 flex items-center justify-center shrink-0"><span className="text-lg font-bold tracking-tight" aria-hidden="true">{initials || <Building2 className="w-6 h-6" />}</span></span>
        <div className="min-w-0"><p className="text-sm font-bold tracking-wide text-surface-900 truncate" title={context.organization.name}>{context.organization.name}</p><p className="mt-0.5 text-xs text-surface-600">Painel de gestão</p></div>
      </>}
      navGroups={navGroups}
      navAriaLabel="Navegação da empresa"
      currentPageLabel={currentPage}
      sidebarFooterExtra={<Link to="/empresa" state={{ selectOrganization: true }} className="btn-ghost w-full justify-start"><Building2 className="w-4 h-4" aria-hidden="true" /> Trocar empresa</Link>}
      user={user}
      onLogout={handleLogout}
    >
      <Outlet key={context.organization.id} context={{ organization: context.organization, role: context.role, updateOrganization } satisfies OrganizationOutletContext} />
    </PanelShell>
  );
}
