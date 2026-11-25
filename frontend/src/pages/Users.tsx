import React, { useEffect, useState } from 'react';
import { request } from '../api';
import { useAuth } from '../App';
import Button from '../components/Button';
import Field from '../components/Field';
import PageHeader from '../components/PageHeader';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type PanelUser = { id: string; name: string | null; email: string; role: string; mustChangePassword: boolean };

export default function Users() {
  useDocumentTitle('Usuários');
  const { user } = useAuth();
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [temporary, setTemporary] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setUsers(await request<PanelUser[]>('/users')); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os usuários.'); } };
  useEffect(() => { void load(); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await request<{ user: PanelUser; temporaryPassword: string }>('/users', { method: 'POST', body: JSON.stringify({ name, email, role }) });
      setTemporary({ email: result.user.email, password: result.temporaryPassword });
      setUsers(previous => [...previous, result.user]); setName(''); setEmail(''); setRole('editor');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.'); }
    finally { setBusy(false); }
  };
  const changeRole = async (account: PanelUser, nextRole: string) => {
    setError(''); setBusy(true);
    try {
      const updated = await request<PanelUser>(`/users/${encodeURIComponent(account.id)}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) });
      setUsers(previous => previous.map(item => item.id === updated.id ? updated : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar a permissão.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <PageHeader title="Usuários" description="Gerencie as contas com acesso ao painel OVERTRIP." />
    {error && <p className="field-error" role="alert">{error}</p>}
    {temporary && <div className="alert-info" role="status">
      <p className="font-semibold">Senha inicial de {temporary.email}</p>
      <p className="break-all font-mono">{temporary.password}</p>
      <p>Copie e compartilhe por um canal seguro. Ela não será exibida novamente. A pessoa deverá criar sua própria senha no primeiro acesso.</p>
      <Button small onClick={() => setTemporary(null)}>Já guardei a senha</Button>
    </div>}
    <form onSubmit={create} className="card p-5 space-y-4">
      <h2 className="font-semibold text-surface-900">Adicionar usuário</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="user-name" label="Nome" required><input id="user-name" className="input" value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></Field>
        <Field id="user-email" label="E-mail" required><input id="user-email" type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></Field>
      </div>
      <Field id="user-role" label="Permissão"><select id="user-role" className="input" value={role} onChange={e => setRole(e.target.value)}><option value="editor">Editor: editar viagens e conteúdo, sem publicar</option><option value="admin">Administrador: todas as funções</option></select></Field>
      <Button type="submit" variant="primary" loading={busy} disabled={!!temporary}>Criar conta</Button>
    </form>
    <section className="card p-5 space-y-3" aria-label="Contas do painel">
      <h2 className="font-semibold text-surface-900">Contas do painel</h2>
      <ul className="divide-y divide-surface-200">{users.map(account => <li key={account.id} className="py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><p className="font-medium text-surface-900">{account.name || account.email}</p><p className="text-sm text-surface-600 break-all">{account.email}{account.mustChangePassword ? ' · Primeiro acesso pendente' : ''}</p></div>
        <label className="text-sm">Permissão <select aria-label={`Permissão de ${account.name || account.email}`} className="input mt-1" value={account.role} disabled={busy || account.id === user?.id || !['admin', 'editor'].includes(account.role)} onChange={e => void changeRole(account, e.target.value)}><option value="admin">Administrador</option><option value="editor">Editor</option>{!['admin', 'editor'].includes(account.role) && <option value={account.role}>{account.role}</option>}</select></label>
      </li>)}</ul>
      <p className="hint">Sua própria permissão não pode ser alterada aqui. Alterar a permissão encerra as sessões da conta. Se perder a senha, use “Esqueci minha senha” na tela de entrada; a recuperação depende de e-mail configurado.</p>
    </section>
  </div>;
}
