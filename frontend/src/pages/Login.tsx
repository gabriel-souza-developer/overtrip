import React, { useState } from 'react';
import { brandUrl } from '../lib/basePath';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Button from '../components/Button';
import { useAuth } from '../App';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './login.css';

export default function Login() {
  useDocumentTitle('Entrar');
  const platformMode = import.meta.env.VITE_PLATFORM_MODE === 'true';
  const destination = platformMode ? '/espaco' : '/dashboard';
  const { login, user } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.mustChangePassword ? '/primeiro-acesso' : (platformMode ? destination : (user.legacyAccess ? '/dashboard' : '/empresa'))} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loggedInUser = await login(email, password);
      navigate(loggedInUser.mustChangePassword ? '/primeiro-acesso' : (platformMode ? destination : (loggedInUser.legacyAccess ? '/dashboard' : '/empresa')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar. Confira o e-mail e a senha.');
    } finally {
      setLoading(false);
    }
  };

  if (platformMode) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-surface-900">Espaços de trabalho</h1>
          <p className="text-surface-600 mt-1">Entre para acessar sua empresa</p>
        </div>

        {/* Login form */}
        <div className="card p-6 sm:p-8">
          {(location.state as { passwordChanged?: boolean } | null)?.passwordChanged && <p role="status" className="mb-6 text-sm text-green-800">Senha alterada. Entre novamente com sua nova senha.</p>}
          {error && (
            <div className="alert-error mb-6" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form space-y-5">
            <div className="form-group">
              <label htmlFor="email" className="label">E-mail</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="label">Senha</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input !pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="btn-icon absolute right-0 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              <div className="login-forgot-row">
                <Link to="/esqueci-senha" className="login-forgot">Esqueci minha senha</Link>
              </div>
            </div>

            <Button type="submit" variant="primary" className="w-full py-3" loading={loading} loadingText="Entrando...">
              Entrar
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-surface-200">
            <p className="text-xs text-surface-600 text-center">Acesso para usuários autorizados</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="login-shell">
      <div className="login-frame">
        <aside className="login-story" aria-label="Sobre a plataforma">
          <div className="login-story-shade" />
          <div className="login-story-top">PLATAFORMA DE GESTÃO <span> / </span> TURISMO</div>
          <div className="login-story-copy"><span className="login-eyebrow">UM NOVO JEITO DE ORGANIZAR</span><p className="login-story-title">Sua próxima jornada começa aqui.</p><p className="login-story-description">Mais organização para o seu negócio. Mais tempo para criar experiências que ficam na memória.</p></div>
          <div className="login-story-footer"><span>GESTÃO PARA QUEM VIVE DE VIAGENS</span><span>01 — 01</span></div>
        </aside>
        <main className="login-main">
          <div className="login-mobile-brand"><img src={brandUrl('overtrip-logo-com-fundo-laranja-192.png')} alt="" width={42} height={42} /><span>OVERTRIP <small>PAINEL DE GESTÃO</small></span></div>
          <div className="login-form-wrap">
            <p className="login-form-eyebrow">BEM-VINDO À OVERTRIP</p>
            <h1>Acesse sua conta</h1>
            <p className="login-intro">Entre com seus dados para acessar o espaço da sua empresa.</p>
          {(location.state as { passwordChanged?: boolean } | null)?.passwordChanged && <p role="status" className="mb-6 text-sm text-green-800">Senha alterada. Entre novamente com sua nova senha.</p>}
          {error && (
            <div className="alert-error mb-6" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form space-y-5">
            <div className="form-group">
              <label htmlFor="email" className="label">E-mail</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="label">Senha</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input !pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="btn-icon absolute right-0 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              <div className="login-forgot-row">
                <Link to="/esqueci-senha" className="login-forgot">Esqueci minha senha</Link>
              </div>
            </div>

            <Button type="submit" variant="primary" className="login-submit w-full py-3" loading={loading} loadingText="Entrando...">
              Entrar <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </form>

          <p className="login-security"><ShieldCheck aria-hidden="true" /> Acesso exclusivo para usuários autorizados</p>
          </div>
          <p className="login-bottom">OVERTRIP <span>·</span> Seu negócio em movimento</p>
        </main>
        </div>
    </div>
  );
}
