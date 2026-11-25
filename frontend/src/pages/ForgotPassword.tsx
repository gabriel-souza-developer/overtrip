import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { brandUrl } from '../lib/basePath';
import { ArrowLeft, Mail } from 'lucide-react';
import Button from '../components/Button';
import { authApi, ApiRequestError } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './login.css';

export default function ForgotPassword() {
  useDocumentTitle('Recuperar senha');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      // Mesma mensagem sempre: não revela se o e-mail tem conta.
      setSent(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) {
        setError('O serviço de e-mail está indisponível no momento. Tente novamente mais tarde.');
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível enviar o link. Tente novamente.');
      }
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
          <div className="login-story-footer"><span>GESTÃO PARA QUEM VIVE DE VIAGENS</span><span>01 — 01</span></div>
        </aside>
        <main className="login-main">
          <div className="login-mobile-brand"><img src={brandUrl('overtrip-logo-com-fundo-laranja-192.png')} alt="" width={42} height={42} /><span>OVERTRIP <small>PAINEL DE GESTÃO</small></span></div>
          <div className="login-form-wrap">
            <p className="login-form-eyebrow">RECUPERAÇÃO DE ACESSO</p>
            <h1>Esqueci minha senha</h1>

            {sent ? (
              <>
                <p className="login-intro" role="status">
                  Se existir uma conta com o e-mail informado, um link para redefinir a senha será enviado em breve. Verifique sua caixa de entrada (e o spam).
                </p>
                <Link to="/login" className="login-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar para o login</Link>
              </>
            ) : (
              <>
                <p className="login-intro">Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>
                {error && <div className="alert-error mb-6" role="alert">{error}</div>}
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
                  <Button type="submit" variant="primary" className="login-submit w-full py-3" loading={loading} loadingText="Enviando...">
                    <Mail className="w-4 h-4" aria-hidden="true" /> Enviar link de redefinição
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
