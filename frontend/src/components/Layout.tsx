import React from 'react';
import { brandUrl } from '../lib/basePath';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, House, Images, MapPinned, Plane, Settings as SettingsIcon, Share2, Ticket, UserCog, UsersRound } from 'lucide-react';
import { useAuth } from '../App';
import { useToast } from '../hooks/useToast';
import PanelShell from './PanelShell';

const navItems = [
  { path: '/dashboard', label: 'Início', icon: House },
  { path: '/trips', label: 'Viagens', icon: Plane },
  { path: '/visits', label: 'Destinos visitados', icon: MapPinned },
  { path: '/leads', label: 'Interessados', icon: UsersRound, adminOnly: true },
  { path: '/reservations', label: 'Reservas', icon: Ticket, adminOnly: true },
  { path: '/social-posts', label: 'Redes sociais', icon: Share2, adminOnly: true },
  { path: '/gallery', label: 'Galeria de memórias', icon: Images },
  { path: '/settings', label: 'Configurações', icon: SettingsIcon, adminOnly: true },
  { path: '/users', label: 'Usuários', icon: UserCog, adminOnly: true },
  { path: '/system', label: 'Saúde do servidor', icon: Activity, adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = navItems.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))?.label ?? 'Painel';

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      navigate('/login');
      toast.error('Sessão removida deste navegador, mas não foi possível confirmar o encerramento no servidor.');
    }
  };

  const groups = [
    { label: 'Operação', items: navItems.filter(item => !['/settings', '/system', '/users'].includes(item.path)) },
    { label: 'Administração', items: navItems.filter(item => ['/settings', '/system', '/users'].includes(item.path)) },
  ].map(({ label, items }) => ({ label, items: items.filter(item => !('adminOnly' in item) || user?.role === 'admin') }));

  return (
    <PanelShell
      brand={<>
        <img src={brandUrl('overtrip-logo-com-fundo-laranja-192.png')} alt="" width={48} height={48} className="w-12 h-12 rounded-xl" />
        <div><p className="text-sm font-bold tracking-wide text-surface-900">OVERTRIP</p><p className="mt-0.5 text-xs text-surface-600">Painel de gestão</p></div>
      </>}
      navGroups={groups}
      navAriaLabel="Navegação do painel"
      currentPageLabel={currentPage}
      user={user}
      onLogout={handleLogout}
    >
      <Outlet />
    </PanelShell>
  );
}
