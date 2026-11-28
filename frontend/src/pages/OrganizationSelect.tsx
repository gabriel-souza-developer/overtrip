import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { brandUrl } from '../lib/basePath';
import { organizationApi, type OrganizationSummary } from '../api/organizations';
import { useAuth } from '../App';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import UserAccountMenu from '../components/UserAccountMenu';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const ROLE_LABELS: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', MEMBER: 'Membro' };

export default function OrganizationSelect() {
  useDocumentTitle('Escolher empresa');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const explicitSelection = (location.state as { selectOrganization?: boolean } | null)?.selectOrganization === true;
  const [organizations, setOrganizations] = useState<OrganizationSummary[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await organizationApi.listMine();
      if (data.organizations.length === 1 && !explicitSelection) {
        navigate(`/empresa/${encodeURIComponent(data.organizations[0].id)}`, { replace: true });
        return;
      }
      setOrganizations(data.organizations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar suas empresas.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const handleLogout = async () => {
    try { await logout(); } finally { navigate('/login'); }
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-white border-b border-surface-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <img src={brandUrl('overtrip-logo-com-fundo-laranja-192.png')} alt="" width={36} height={36} className="w-9 h-9 rounded-lg shrink-0" />
            <p className="truncate text-sm font-bold text-surface-900">OVERTRIP · Área da empresa</p>
          </div>
          <UserAccountMenu user={user} onLogout={handleLogout} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Suas empresas</h1>
          <p className="text-surface-600 mt-1">Selecione a empresa para consultar viagens, interessados e reservas.</p>
        </div>

        {error && <ErrorState message={error} onRetry={() => void load()} />}

        {loading ? (
          <p role="status" className="text-sm text-surface-600">Carregando empresas...</p>
        ) : !error && organizations?.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="Nenhuma empresa vinculada"
            text="Sua conta ainda não tem vínculo ativo com nenhuma empresa. Fale com um administrador para solicitar acesso."
          />
        ) : organizations && organizations.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {organizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => navigate(`/empresa/${org.id}`)}
                className="card p-5 text-left hover:border-primary-300 hover:shadow-md motion-safe:transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-primary-50 text-primary-800 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-surface-900 truncate">{org.name}</p>
                    <p className="text-sm text-surface-600">{ROLE_LABELS[org.role] ?? org.role}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
