import React, { useEffect, useState } from 'react';
import { BedDouble, CalendarDays, ChevronRight, Compass, LayoutDashboard, LogOut, Menu, UtensilsCrossed, X } from 'lucide-react';
import { request } from '../api';
import { useAuth } from '../App';
import WorkspaceLodging from './WorkspaceLodging';
import WorkspaceRestaurant from './WorkspaceRestaurant';
import WorkspaceOverview from './WorkspaceOverview';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './workspace.css';

interface Organization { id: string; name: string; slug: string; niche: string; role: string }
type View = 'overview' | 'operation';
const nicheLabel = (niche: string) => niche === 'pousada' ? 'Hospedagem' : niche === 'restaurante' ? 'Restaurante' : niche;
const roleLabel = (role: string) => ({ OWNER: 'Proprietário', ADMIN: 'Administrador', MEMBER: 'Equipe' } as Record<string, string>)[role] || role;

/** Espaço isolado: todas as operações usam apenas APIs da plataforma. */
export default function Workspace() {
  useDocumentTitle('Espaço');
  const { user, logout } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [current, setCurrent] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<View>('overview');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setCurrent(null);
    request<{ organizations: Organization[] }>('/organizations').then(async ({ organizations: available }) => {
      if (!active) return;
      setOrganizations(available);
      if (available.length === 1) {
        const result = await request<{ organization: Omit<Organization, 'role'>; role: string }>(`/organizations/${encodeURIComponent(available[0].id)}`);
        if (active) setCurrent({ ...result.organization, role: result.role });
      }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar os espaços.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  const select = async (id: string) => {
    setLoading(true); setError(''); setMenuOpen(false);
    try {
      const result = await request<{ organization: Omit<Organization, 'role'>; role: string }>(`/organizations/${encodeURIComponent(id)}`);
      setCurrent({ ...result.organization, role: result.role }); setView('overview');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir o espaço.'); }
    finally { setLoading(false); }
  };
  const go = (next: View) => { setView(next); setMenuOpen(false); };
  const signOut = async () => {
    try { await logout(); }
    catch { setError('Não foi possível confirmar o encerramento da sessão.'); }
  };
  const label = view === 'overview' ? 'Visão geral' : current?.niche === 'restaurante' ? 'Reservas e mesas' : 'Reservas e unidades';
  const operator = user?.name || user?.email || 'Conta';

  return <div className="workspace-app">
    <a href="#workspace-content" className="workspace-skip">Ir para o conteúdo</a>
    <div className="workspace-mobile"><div className="workspace-brand"><span className="workspace-brand-icon"><Compass size={17} /></span> ENTRE<span>·</span>VIAS</div><button type="button" className="workspace-menu-toggle" onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="workspace-sidebar">{menuOpen ? <X size={21} /> : <Menu size={21} />}</button></div>
    {menuOpen && <button type="button" aria-label="Fechar menu" className="workspace-backdrop" onClick={() => setMenuOpen(false)} />}
    <div className="workspace-layout">
      <aside id="workspace-sidebar" className={`workspace-sidebar${menuOpen ? ' is-open' : ''}`} aria-label="Navegação do espaço">
        <div className="workspace-brand workspace-desktop-brand"><span className="workspace-brand-icon"><Compass size={17} /></span> ENTRE<span>·</span>VIAS</div>
        <p className="workspace-side-label">ESPAÇO DE TRABALHO</p>
        {current ? <div className="workspace-company"><span className="workspace-company-icon">{current.name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span><span><strong>{current.name}</strong><small>{nicheLabel(current.niche)}</small></span></div> : <p className="workspace-side-empty">Selecione uma empresa</p>}
        {organizations.length > 1 && current && <button type="button" className="workspace-switch" onClick={() => { setCurrent(null); setMenuOpen(false); }}>Trocar espaço</button>}
        <p className="workspace-side-label workspace-nav-label">MENU PRINCIPAL</p>
        <nav aria-label="Menu da plataforma" className="workspace-nav">
          <button type="button" disabled={!current} aria-current={current && view === 'overview' ? 'page' : undefined} onClick={() => go('overview')}><LayoutDashboard size={18} />Visão geral</button>
          <button type="button" disabled={!current} aria-current={current && view === 'operation' ? 'page' : undefined} onClick={() => go('operation')}><CalendarDays size={18} />{current?.niche === 'restaurante' ? 'Reservas e mesas' : 'Reservas e unidades'}</button>
        </nav>
        <div className="workspace-side-bottom"><div className="workspace-help"><strong>Seu espaço de trabalho</strong><p>Acompanhe e organize suas reservas em um só lugar.</p></div><button type="button" className="workspace-signout" onClick={() => void signOut()}><LogOut size={17} /> Sair</button></div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar"><div className="workspace-breadcrumb">{current ? <h2>{current.name}</h2> : <span>Painel</span>}<ChevronRight size={14} /><strong>{current ? label : 'Espaços de trabalho'}</strong></div><div className="workspace-user"><span className="workspace-avatar">{operator.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span><span><strong>{operator}</strong><small>{current ? roleLabel(current.role) : 'Conta'}</small></span></div></header>
        <main id="workspace-content" className="workspace-content" tabIndex={-1}>
          {error && <div className="workspace-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setVersion(value => value + 1)}>Tentar novamente</button></div>}
          {loading ? <p role="status" className="workspace-status">Carregando espaço...</p> : current ? <>
            {view === 'operation' && <header className="workspace-heading"><div><p className="workspace-kicker"><span /> {nicheLabel(current.niche)}</p><h1>{label}</h1><p>Organize as atividades do seu espaço.</p></div></header>}
            {view === 'overview' ? <WorkspaceOverview key={current.id} organizationId={current.id} niche={current.niche} onOpen={() => go('operation')} /> : current.niche === 'pousada' ? <WorkspaceLodging key={current.id} organizationId={current.id} /> : current.niche === 'restaurante' ? <WorkspaceRestaurant key={current.id} organizationId={current.id} /> : <p>Este espaço ainda não tem módulos operacionais disponíveis.</p>}
          </> : organizations.length ? <section><header className="workspace-heading"><div><p className="workspace-kicker"><span /> SEUS ESPAÇOS</p><h1>Escolha uma empresa</h1><p>Abra o espaço que deseja acompanhar.</p></div></header><div className="workspace-org-grid">{organizations.map(org => <button key={org.id} type="button" className="workspace-org-card" onClick={() => void select(org.id)}><span className="workspace-org-icon">{org.niche === 'restaurante' ? <UtensilsCrossed size={20} /> : <BedDouble size={20} />}</span><span><strong>{org.name}</strong><small>{nicheLabel(org.niche)}</small></span><ChevronRight size={17} /></button>)}</div></section> : !error && <section className="workspace-empty"><h1>Nenhuma empresa disponível</h1><p>Esta conta ainda não está vinculada a uma empresa ativa.</p></section>}
        </main>
      </div>
    </div>
  </div>;
}
