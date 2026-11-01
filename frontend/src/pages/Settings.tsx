import { useEffect, useState } from 'react';
import { MessageCircle, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { settingsApi } from '../api';
import { useToast } from '../hooks/useToast';

export default function Settings() {
  const { toast } = useToast();
  const [defaultWhatsapp, setDefaultWhatsapp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsApi.getWhatsapp()
      .then(({ defaultWhatsapp }) => setDefaultWhatsapp(defaultWhatsapp || ''))
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar as configurações.'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalized = defaultWhatsapp.replace(/\D/g, '');
    if (!/^\d{12,13}$/.test(normalized)) {
      setError('Informe o WhatsApp com 12 ou 13 dígitos, incluindo DDI e DDD.');
      return;
    }
    setSaving(true);
    try {
      const result = await settingsApi.updateWhatsapp(normalized);
      setDefaultWhatsapp(result.defaultWhatsapp);
      toast.success('WhatsApp atualizado. O site usará o novo número nas próximas visitas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Configurações" description="Defina o WhatsApp padrão usado nos contatos do site." />
      <form className="card p-5 sm:p-6 space-y-5" onSubmit={save} noValidate>
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-surface-900">WhatsApp da agência</h2>
            <p className="text-sm text-surface-600 mt-1">Este número recebe os contatos das viagens e dos botões gerais do site.</p>
          </div>
        </div>
        <div>
          <label htmlFor="defaultWhatsapp" className="label">Número com DDI e DDD</label>
          <input
            id="defaultWhatsapp"
            className="input max-w-md"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="5545999999999"
            value={defaultWhatsapp}
            onChange={(event) => setDefaultWhatsapp(event.target.value.replace(/\D/g, ''))}
            aria-describedby="defaultWhatsapp-hint"
            disabled={loading || saving}
          />
          <p id="defaultWhatsapp-hint" className="mt-2 text-sm text-surface-600">Use apenas números. Exemplo: 5545999999999.</p>
        </div>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={loading || saving}>
          <Save className="w-4 h-4" aria-hidden="true" /> {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </form>
    </div>
  );
}
