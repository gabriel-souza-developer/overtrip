import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Camera, ChevronDown, KeyRound, LogOut, User } from 'lucide-react';
import ChangePasswordDialog from './ChangePasswordDialog';
import Modal from './Modal';
import Button from './Button';

interface UserAccountMenuProps {
  user: { name?: string; email?: string } | null | undefined;
  onLogout: () => void | Promise<void>;
}

export default function UserAccountMenu({ user, onLogout }: UserAccountMenuProps) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoMissing, setPhotoMissing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const savePhoto = async (remove = false) => {
    if (!remove && !file) return;
    if (file && !remove && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Escolha uma imagem JPEG, PNG ou WebP de até 5 MiB.');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await fetch('/api/profile/avatar', { method: remove ? 'DELETE' : 'PUT', credentials: 'same-origin', ...(remove ? {} : { headers: { 'Content-Type': file!.type }, body: file! }) });
      if (!result.ok) {
        const details = await result.json().catch(() => ({}));
        throw new Error(typeof details.error === 'string' ? details.error : 'Não foi possível atualizar a foto.');
      }
      setFile(null); setPhotoMissing(remove); setPhotoVersion(version => version + 1); setPhotoOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar a foto.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="flex items-center gap-2 px-2 py-1.5 min-h-[44px] rounded-lg text-surface-700 hover:bg-surface-100" aria-label="Minha conta">
          <span className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            {!photoMissing && user ? <img key={photoVersion} src={`/api/profile/avatar?v=${photoVersion}`} alt="" className="w-full h-full rounded-full object-cover" onError={() => setPhotoMissing(true)} /> : <User className="w-5 h-5 text-primary-800" aria-hidden="true" />}
          </span>
          <span className="hidden sm:block text-sm font-medium">{user?.name || user?.email}</span>
          <ChevronDown className="w-4 h-4 hidden sm:block" aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu-content" align="end" sideOffset={4}>
            <div className="px-3 py-2 border-b border-surface-200 mb-1">
              <p className="text-sm font-medium text-surface-900">{user?.name}</p>
              <p className="text-xs text-surface-600 break-all">{user?.email}</p>
            </div>
            <Menu.Item className="menu-item" onSelect={() => { setError(''); setPhotoOpen(true); }}>
              <Camera className="w-4 h-4" aria-hidden="true" /> Alterar foto de perfil
            </Menu.Item>
            <Menu.Item className="menu-item" onSelect={() => setPasswordOpen(true)}>
              <KeyRound className="w-4 h-4" aria-hidden="true" /> Trocar senha
            </Menu.Item>
            <Menu.Item className="menu-item" onSelect={() => { void onLogout(); }}>
              <LogOut className="w-4 h-4" aria-hidden="true" /> Sair
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <Modal open={photoOpen} onOpenChange={value => { if (!busy) { setPhotoOpen(value); if (!value) setFile(null); } }} title="Foto de perfil" description="Escolha uma imagem JPEG, PNG ou WebP de até 5 MiB.">
        <div className="space-y-4">
          <label className="label" htmlFor="profile-avatar">Imagem</label>
          <input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" className="input" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); }} />
          {file && <p className="text-sm text-surface-700 break-all">{file.name}</p>}
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!file || busy} onClick={() => void savePhoto()}>Salvar foto</Button>
            {!photoMissing && <Button variant="secondary" disabled={busy} onClick={() => void savePhoto(true)}>Remover foto</Button>}
          </div>
        </div>
      </Modal>
    </>
  );
}
