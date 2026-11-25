import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useAuth } from '../App';
import { authApi } from '../api';
import Button from '../components/Button';
import Field from '../components/Field';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function FirstPassword() {
  useDocumentTitle('Primeiro acesso');
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (loading) return <p className="p-6">Carregando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (next.length < 8 || new TextEncoder().encode(next).length > 72 || /[\r\n\0]/.test(next)) {
      setError('A nova senha deve ter pelo menos 8 caracteres, no máximo 72 bytes e não pode conter quebras de linha.'); return;
    }
    if (next !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return; }
    if (next === current) { setError('Escolha uma senha diferente da senha atual.'); return; }
    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirmation('');
      flushSync(() => window.dispatchEvent(new Event('overtrip:session-ended')));
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha.'); }
    finally { setSaving(false); }
  };
  return <main className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
    <div className="card w-full max-w-lg p-6 space-y-4">
      <h1 className="text-xl font-semibold text-surface-900">Crie sua senha</h1>
      <p className="text-sm text-surface-700">No primeiro acesso, substitua a senha inicial por uma senha pessoal. Guarde-a em um gerenciador de senhas ou em outro lugar seguro.</p>
      <p className="text-sm text-surface-600">Use pelo menos 8 caracteres, até 72 bytes e sem quebras de linha. Após salvar, entre novamente.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field id="first-current" label="Senha inicial" required><input id="first-current" type="password" autoComplete="current-password" className="input" value={current} onChange={e => setCurrent(e.target.value)} required disabled={saving} /></Field>
        <Field id="first-next" label="Nova senha" required><input id="first-next" type="password" autoComplete="new-password" className="input" value={next} onChange={e => setNext(e.target.value)} required disabled={saving} /></Field>
        <Field id="first-confirmation" label="Confirme a nova senha" required><input id="first-confirmation" type="password" autoComplete="new-password" className="input" value={confirmation} onChange={e => setConfirmation(e.target.value)} required disabled={saving} /></Field>
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="flex gap-2"><Button type="submit" variant="primary" loading={saving} loadingText="Salvando…">Salvar nova senha</Button><Button disabled={saving} onClick={() => { void logout(); }}>Sair</Button></div>
      </form>
    </div>
  </main>;
}
