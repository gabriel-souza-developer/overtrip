import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import Button from '../components/Button';
import { useAuth } from '../App';
import { authApi } from '../api';

export default function Login() {
  const { login, user } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar. Confira o e-mail e a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/brand/overtrip-logo-com-fundo-laranja-192.png" alt="OVERTRIP" width={96} height={96} className="w-24 h-24 rounded-xl mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-surface-900">Painel OVERTRIP</h1>
          <p className="text-surface-600 mt-1">Entre para gerenciar as viagens</p>
        </div>

        {/* Login form */}
        <div className="card p-6 sm:p-8">
          {error && (
            <div className="alert-error mb-6" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label htmlFor="email" className="label">E-mail</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@overtrip.com.br"
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
            </div>

            <Button type="submit" variant="primary" className="w-full py-3" loading={loading} loadingText="Entrando...">
              Entrar
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-surface-200">
            <p className="text-xs text-surface-600 text-center">
              Acesso restrito à equipe OVERTRIP
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}