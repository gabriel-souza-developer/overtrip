import React, { useEffect, useState } from 'react';
import { request } from '../api';
import Button from '../components/Button';
import WorkspaceLodging from './WorkspaceLodging';

interface Organization { id: string; name: string; slug: string; niche: string; role: string }

/** Espaço experimental isolado: nunca usa rotas globais de turismo. */
export default function Workspace() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [current, setCurrent] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setCurrent(null);
    request<{ organizations: Organization[] }>('/organizations').then(async ({ organizations: available }) => {
      if (!active) return;
      setOrganizations(available);
      if (available.length === 1) {
        const result = await request<{ organization: Organization }>('/organizations/current', { headers: { 'X-Organization-Id': available[0].id } });
        if (active) setCurrent(result.organization);
      }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar os espaços.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  const select = async (id: string) => {
    setLoading(true); setError('');
    try {
      const result = await request<{ organization: Organization }>('/organizations/current', { headers: { 'X-Organization-Id': id } });
      setCurrent(result.organization);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir o espaço.'); }
    finally { setLoading(false); }
  };

  return <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
    <header><p className="text-sm text-surface-600">Ambiente de desenvolvimento</p><h1 className="text-2xl font-semibold">Espaços de trabalho</h1></header>
    {error && <div role="alert" className="text-red-700"><p>{error}</p><Button small onClick={() => setVersion(v => v + 1)}>Tentar novamente</Button></div>}
    {loading ? <p role="status">Carregando espaço...</p> : current ? <section className="space-y-5">
      <h2 className="text-xl font-semibold">{current.name}</h2>
      <p className="text-sm text-surface-600">{current.niche} · {current.role}</p>
      {organizations.length > 1 && <Button onClick={() => setCurrent(null)}>Trocar espaço</Button>}
      {current.niche === 'pousada' ? <WorkspaceLodging key={current.id} organizationId={current.id} /> : <p>Este espaço ainda não tem módulos operacionais disponíveis.</p>}
    </section> : organizations.length ? <div className="grid gap-3">{organizations.map(org => <button key={org.id} type="button" className="card p-5 text-left hover:border-primary-500" onClick={() => void select(org.id)}><strong>{org.name}</strong><span className="block text-sm text-surface-600">{org.niche}</span></button>)}</div> : !error && <p>Esta conta ainda não está vinculada a uma empresa ativa.</p>}
  </main>;
}
