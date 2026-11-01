import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Home, Image as ImageIcon, LogOut, MapPin, Menu as MenuIcon, Plane, User, X } from 'lucide-react';
import { useAuth } from '../App';

const navItems = [
  { path: '/dashboard', label: 'Início', icon: Home },
  { path: '/trips', label: 'Viagens', icon: Plane },
  { path: '/visits', label: 'Visitas', icon: MapPin },
  { path: '/gallery', label: 'Galeria', icon: ImageIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Esc fecha o menu lateral no celular e devolve o foco ao botão que o abriu.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // Ao trocar de tela, o foco vai para o conteúdo (leitores de tela e teclado).
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-surface-50">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg">
        Ir para o conteúdo
      </a>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-surface-200 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Menu principal"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
            <img src="/brand/overtrip-logo-com-fundo-laranja-192.png" alt="OVERTRIP" width={56} height={56} className="w-14 h-14 rounded-lg" />
            <button type="button" className="btn-icon lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
                  }`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-surface-200">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-primary-700" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">{user?.name}</p>
                <p className="text-xs text-surface-600 truncate">{user?.email}</p>
              </div>
            </div>
            <button type="button" className="btn-ghost w-full justify-start mt-1" onClick={handleLogout}>
              <LogOut className="w-4 h-4" aria-hidden="true" /> Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b border-surface-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6">
            <button
              ref={menuButtonRef}
              type="button"
              className="btn-icon lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={sidebarOpen}
            >
              <MenuIcon className="w-6 h-6" aria-hidden="true" />
            </button>
            <div className="flex-1" />
            <Menu.Root>
              <Menu.Trigger className="flex items-center gap-2 px-2 py-1.5 min-h-[44px] rounded-lg text-surface-700 hover:bg-surface-100" aria-label="Minha conta">
                <span className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-700" aria-hidden="true" />
                </span>
                <span className="hidden sm:block text-sm font-medium">{user?.name}</span>
                <ChevronDown className="w-4 h-4 hidden sm:block" aria-hidden="true" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="menu-content" align="end" sideOffset={4}>
                  <div className="px-3 py-2 border-b border-surface-200 mb-1">
                    <p className="text-sm font-medium text-surface-900">{user?.name}</p>
                    <p className="text-xs text-surface-600 break-all">{user?.email}</p>
                  </div>
                  <Menu.Item className="menu-item" onSelect={handleLogout}>
                    <LogOut className="w-4 h-4" aria-hidden="true" /> Sair
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </header>

        <main id="conteudo" ref={mainRef} tabIndex={-1} className="p-4 sm:p-6 lg:p-8 max-w-7xl outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
