import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react';
import ChangePasswordDialog from './ChangePasswordDialog';

interface UserAccountMenuProps {
  user: { name?: string; email?: string } | null | undefined;
  onLogout: () => void | Promise<void>;
}

export default function UserAccountMenu({ user, onLogout }: UserAccountMenuProps) {
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="flex items-center gap-2 px-2 py-1.5 min-h-[44px] rounded-lg text-surface-700 hover:bg-surface-100" aria-label="Minha conta">
          <span className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <User className="w-5 h-5 text-primary-500" aria-hidden="true" />
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
    </>
  );
}
