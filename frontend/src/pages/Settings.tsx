import { useEffect, useState } from 'react';
import { MessageCircle, Palette, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { settingsApi, type TripPresentationDefaults } from '../api';
import { useToast } from '../hooks/useToast';
import AssistantKnowledgeSettings from '../components/AssistantKnowledgeSettings';
import PublicFaqSettings from '../components/PublicFaqSettings';

export default function Settings() {
  const { toast } = useToast();
  const [defaultWhatsapp, setDefaultWhatsapp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [presentation, setPresentation] = useState<TripPresentationDefaults>({
    buttonLabel: 'Quero viajar', buttonClass: 'button-dark', priceUnit: 'por pessoa',
  });
  const [savingPresentation, setSavingPresentation] = useState(false);
  const [presentationError, setPresentationError] = useState('');

  useEffect(() => {
    Promise.all([settingsApi.getWhatsapp(), settingsApi.getTripPresentation()])
      .then(([whatsapp, defaults]) => {
        setDefaultWhatsapp(whatsapp.defaultWhatsapp || '');
        setPresentation(defaults);
      })
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

  const savePresentation = async (event: React.FormEvent) => {
    event.preventDefault();
    setPresentationError('');
    if (!presentation.buttonLabel.trim() || !presentation.priceUnit.trim()) {
      setPresentationError('Preencha o texto do botão e a unidade do preço.');
      return;
    }
    setSavingPresentation(true);
    try {
      const result = await settingsApi.updateTripPresentation({
        ...presentation,
        buttonLabel: presentation.buttonLabel.trim(),
        priceUnit: presentation.priceUnit.trim(),
      });
      setPresentation(result);
      toast.success('Padrões de novas viagens atualizados. Viagens existentes foram preservadas.');
    } catch (err) {
      setPresentationError(err instanceof Error ? err.message : 'Não foi possível salvar os padrões da viagem.');
    } finally {
      setSavingPresentation(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Configurações" description="Defina os contatos e os padrões usados nas novas viagens." />
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

      <form className="card p-5 sm:p-6 space-y-5" onSubmit={savePresentation} noValidate>
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary-100 text-primary-500 flex items-center justify-center shrink-0">
            <Palette className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Padrões das novas viagens</h2>
            <p className="text-sm text-surface-600 mt-1">Aplicados quando uma viagem é criada. Viagens existentes mantêm seus valores atuais.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="defaultButtonLabel" className="label">Texto do botão</label>
            <input id="defaultButtonLabel" className="input" value={presentation.buttonLabel} onChange={(event) => setPresentation(prev => ({ ...prev, buttonLabel: event.target.value }))} disabled={loading || savingPresentation} />
          </div>
          <div>
            <label htmlFor="defaultPriceUnit" className="label">Unidade do preço</label>
            <input id="defaultPriceUnit" className="input" value={presentation.priceUnit} onChange={(event) => setPresentation(prev => ({ ...prev, priceUnit: event.target.value }))} disabled={loading || savingPresentation} placeholder="por pessoa" />
          </div>
        </div>
        <div>
          <label htmlFor="defaultButtonClass" className="label">Estilo do botão</label>
          <select id="defaultButtonClass" className="select max-w-md" value={presentation.buttonClass} onChange={(event) => setPresentation(prev => ({ ...prev, buttonClass: event.target.value as TripPresentationDefaults['buttonClass'] }))} disabled={loading || savingPresentation}>
            <option value="button-dark">Escuro</option>
            <option value="button-rust">Laranja</option>
            <option value="button-light">Claro</option>
            <option value="button-outline">Só contorno</option>
          </select>
        </div>
        {presentationError ? <p className="text-sm text-red-700" role="alert">{presentationError}</p> : null}
        <button type="submit" className="btn-primary" disabled={loading || savingPresentation}>
          <Save className="w-4 h-4" aria-hidden="true" /> {savingPresentation ? 'Salvando...' : 'Salvar padrões'}
        </button>
      </form>
      <PublicFaqSettings />
      <AssistantKnowledgeSettings />
    </div>
  );
}
