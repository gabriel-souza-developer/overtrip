import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import Field from './Field';
import Modal from './Modal';

export default function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const clear = () => { setCurrent(''); setNext(''); setConfirmation(''); setError(''); setConfirmDiscard(false); };
  const close = () => {
    if (saving) return;
    if (current || next || confirmation) { setConfirmDiscard(true); return; }
    clear(); onClose();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!current) { setError('Informe a senha atual.'); return; }
    if (next.length < 8 || new TextEncoder().encode(next).length > 72 || /[\r\n\0]/.test(next)) {
      setError('A nova senha deve ter pelo menos 8 caracteres, no máximo 72 bytes e não pode conter quebras de linha.'); return;
    }
    if (next !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return; }
    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      clear();
      // O servidor já encerrou a sessão; limpar estado local sem novo logout.
      flushSync(() => window.dispatchEvent(new Event('overtrip:session-ended')));
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally { setSaving(false); }
  };

  return <>
    <Modal open={open} onOpenChange={value => { if (!value) close(); }} title="Trocar senha" description="Após a alteração, entre novamente com a nova senha.">
      <form onSubmit={submit} className="space-y-4">
        <Field id="current-password" label="Senha atual" required><input id="current-password" type="password" className="input" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} disabled={saving} required /></Field>
        <Field id="new-password" label="Nova senha" required><input id="new-password" type="password" className="input" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} disabled={saving} required /></Field>
        <Field id="confirm-password" label="Confirmar nova senha" required><input id="confirm-password" type="password" className="input" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={saving} required /></Field>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button onClick={close} disabled={saving}>Cancelar</Button><Button type="submit" variant="primary" loading={saving} loadingText="Alterando...">Alterar senha</Button></div>
      </form>
    </Modal>
    <ConfirmDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Descartar alteração?" description="Os campos preenchidos serão apagados." confirmLabel="Descartar" onConfirm={() => { clear(); onClose(); }} />
  </>;
}
