import React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { MoreVertical } from 'lucide-react';

export interface RowMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * Menu "Mais opções" de uma linha. O Radix cuida de abrir por cima de tudo (sem corte pela
 * rolagem da tabela), de mover com as setas, fechar com Esc e devolver o foco ao botão.
 */
export default function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="btn-icon" aria-label={label}>
        <MoreVertical className="w-5 h-5" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu-content" align="end" sideOffset={4} collisionPadding={8}>
          {items.map((item) => (
            <Menu.Item
              key={item.key}
              className={`menu-item ${item.danger ? 'menu-item-danger' : ''}`}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
