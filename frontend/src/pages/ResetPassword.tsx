import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { brandUrl } from '../lib/basePath';
import { ArrowLeft, KeyRound } from 'lucide-react';
import Button from '../components/Button';
import { authApi } from '../api';
import { extractTokenFromHash } from '../lib/resetPasswordToken';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './login.css';

function validatePassword(value: string): string | null {
  if (value.length < 8 || new TextEncoder().encode(value).length > 72 || /[\r\n\0]/.test(value)) {
    return 'A nova senha deve ter pelo menos 8 caracteres, no máximo 72 bytes e não pode conter quebras de linha.';
  }
  return null;
}

export default function ResetPassword() {
  useDocumentTitle('Nova senha');
  const [token] = useState(() => extractTokenFromHash(window.location.hash));
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Remove o token da barra de endereço assim que a página carrega: não
    // deve sobreviver no histórico do navegador, em compartilhamentos de
    // tela ou se a página for recarregada/favoritada depois.
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const passwordError = validatePassword(newPassword);
    if (passwordError) { setError(passwordError); return; }
    if (newPassword !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return; }

    setLoading(true);
    try {
      await authApi.resetPassword(token, newPassword);
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-frame">
        <aside className="login-story" aria-label="Sobre a plataforma">
          <div className="login-story-shade" />
          <div className="login-story-top">PLATAFORMA DE GESTÃO <span> / </span> TURISMO</div>
          <div className="login-story-copy"><span className="login-eyebrow">UM NOVO JEITO DE ORGANIZAR</span><p className="login-story-title">Sua próxima jornada começa aqui.</p><p className="login-story-description">Mais organização para o seu negócio. Mais tempo para criar experiências que ficam na memória.</p></div>
          <div className="login-story-footer"><span>GESTÃO PARA QUEM VIVE DE VIAGENS</span></div>
        </aside>
        <main className="login-main">
          <div className="login-mobile-brand"><img src={brandUrl('overtrip-logo-com-fundo-laranja-192.png')} alt="" width={42} height={42} /><span>OVERTRIP <small>PAINEL DE GESTÃO</small></span></div>
          <div className="login-form-wrap">
            <p className="login-form-eyebrow">RECUPERAÇÃO DE ACESSO</p>
            <h1>Criar nova senha</h1>

            {!token ? (
              <>
                <p className="login-intro" role="alert">Link inválido. Solicite uma nova redefinição de senha.</p>
                <Link to="/esqueci-senha" className="login-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Solicitar novo link</Link>
              </>
            ) : (
              <>
                <p className="login-intro">Escolha uma nova senha para a sua conta.</p>
                {error && <div className="alert-error mb-6" role="alert">{error}</div>}
                <form onSubmit={handleSubmit} className="login-form space-y-5">
                  <div className="form-group">
                    <label htmlFor="new-password" className="label">Nova senha</label>
                    <input
                      id="new-password"
                      type="password"
                      className="input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirm-password" className="label">Confirmar nova senha</label>
                    <input
                      id="confirm-password"
                      type="password"
                      className="input"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={loading}
                    />
                  </div>
                  <Button type="submit" variant="primary" className="login-submit w-full py-3" loading={loading} loadingText="Salvando...">
                    <KeyRound className="w-4 h-4" aria-hidden="true" /> Redefinir senha
                  </Button>
                </form>
                <Link to="/login" className="login-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar para o login</Link>
              </>
            )}
          </div>
          <p className="login-bottom">OVERTRIP <span>·</span> Seu negócio em movimento</p>
        </main>
      </div>
    </div>
  );
}
