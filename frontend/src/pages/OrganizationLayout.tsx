import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Building2, LogOut, Plane, Ticket, UsersRound } from 'lucide-react';
import { organizationApi, type OrganizationContext } from '../api/organizations';
import { useAuth } from '../App';
import Button from '../components/Button';
import ErrorState from '../components/ErrorState';
import ChangePasswordDialog from '../components/ChangePasswordDialog';

export interface OrganizationOutletContext { organization: OrganizationContext['organization']; role: string }

const CAN_VIEW_PRIVATE_DATA = (role: string) => role === 'OWNER' || role === 'ADMIN';

export default function OrganizationLayout() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();
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

  const handleLogout = async () => {
    try { await logout(); } finally { navigate('/login'); }
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
    { path: 'trips', label: 'Viagens', icon: Plane },
    ...(canViewPrivateData ? [
      { path: 'leads', label: 'Interessados', icon: UsersRound },
      { path: 'reservations', label: 'Reservas', icon: Ticket },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-white border-b border-surface-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-primary-50 text-primary-500 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-surface-900 truncate">{context.organization.name}</p>
              <Link to="/empresa" state={{ selectOrganization: true }} className="text-xs text-primary-600 hover:underline">Trocar empresa</Link>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2"><Button small onClick={() => setPasswordOpen(true)}>Trocar senha</Button><Button small onClick={() => void handleLogout()} icon={<LogOut className="w-4 h-4" aria-hidden="true" />}>Sair</Button></div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto" aria-label="Navegação da empresa">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                  isActive ? 'border-primary-600 text-primary-600' : 'border-transparent text-surface-600 hover:text-surface-900'
                }`
              }
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <React.Suspense fallback={<div className="flex justify-center py-16" role="status" aria-label="Carregando"><div className="spinner w-8 h-8" /></div>}>
          <Outlet key={context.organization.id} context={{ organization: context.organization, role: context.role } satisfies OrganizationOutletContext} />
        </React.Suspense>
      </main>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
