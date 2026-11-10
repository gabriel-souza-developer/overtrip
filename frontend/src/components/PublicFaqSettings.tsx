import { useEffect, useState } from 'react';
import { publicFaqApi, type KnowledgeEntry, type PublicFaqState } from '../api';

const emptyEntry = (): KnowledgeEntry => ({ question: '', answer: '' });

export default function PublicFaqSettings() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const applyState = (state: PublicFaqState) => {
    setEntries(state.entries);
    setVersion(state.version);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try { applyState(await publicFaqApi.current()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar o FAQ do site.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const update = (index: number, field: keyof KnowledgeEntry, value: string) => {
    setEntries(current => current.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
  };
  const move = (index: number, direction: -1 | 1) => {
    setEntries(current => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (entries.some(entry => !entry.question.trim() || !entry.answer.trim())) {
      setError('Preencha a pergunta e a resposta de cada item ou remova o item vazio.');
      return;
    }
    setSaving(true);
    try {
      const state = await publicFaqApi.publish(entries, version);
      applyState(state);
      setMessage('FAQ salvo e atualizado no site.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o FAQ.');
    } finally { setSaving(false); }
  };

  return <section className="card p-5 sm:p-6 space-y-5" aria-labelledby="public-faq-title">
    <div>
      <h2 id="public-faq-title" className="text-lg font-semibold text-surface-900">Perguntas frequentes do site</h2>
      <p className="mt-1 text-sm text-surface-600">Edite as perguntas e respostas que aparecem em overtrip.com.br. Ao salvar, o FAQ do site é atualizado automaticamente.</p>
      <p className="mt-1 text-xs text-surface-500">Versão {version} · A ordem abaixo é a ordem exibida no site.</p>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={save} className="space-y-4" aria-busy={loading || saving}>
        {loading ? <p role="status" className="text-sm text-surface-600">Carregando perguntas do site…</p> : entries.map((entry, index) => <fieldset key={index} className="space-y-2 rounded-lg border border-surface-200 p-3" disabled={saving}>
          <legend className="text-sm font-semibold">Pergunta {index + 1}</legend>
          <label className="label" htmlFor={`public-faq-question-${index}`}>Pergunta</label>
          <input id={`public-faq-question-${index}`} className="input" maxLength={300} value={entry.question} onChange={event => update(index, 'question', event.target.value)} />
          <label className="label" htmlFor={`public-faq-answer-${index}`}>Resposta</label>
          <textarea id={`public-faq-answer-${index}`} className="input" rows={4} maxLength={3000} value={entry.answer} onChange={event => update(index, 'answer', event.target.value)} />
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" className="text-sm text-surface-700 underline" disabled={saving || index === 0} onClick={() => move(index, -1)}>Mover para cima</button>
            <button type="button" className="text-sm text-surface-700 underline" disabled={saving || index === entries.length - 1} onClick={() => move(index, 1)}>Mover para baixo</button>
            <button type="button" className="text-sm text-red-700 underline" disabled={saving || entries.length <= 1} onClick={() => setEntries(current => current.filter((_, i) => i !== index))}>Remover</button>
          </div>
        </fieldset>)}

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" disabled={loading || saving || entries.length >= 20} onClick={() => setEntries(current => [...current, emptyEntry()])}>Adicionar pergunta</button>
          <button type="submit" className="btn-primary" disabled={loading || saving || entries.length === 0}>{saving ? 'Salvando…' : 'Salvar e atualizar o site'}</button>
          <button type="button" className="btn-secondary" disabled={loading || saving} onClick={() => void load()}>Recarregar</button>
        </div>
        <p className="text-xs text-surface-500">Recarregar descarta as alterações que ainda não foram salvas.</p>
      </form>

      <aside className="rounded-xl border border-surface-200 bg-surface-50 p-4" aria-label="Prévia do FAQ no site">
        <h3 className="font-semibold text-surface-900">Prévia no site</h3>
        <div className="mt-3 space-y-2">
          {entries.map((entry, index) => <details key={index} className="rounded-lg border border-surface-200 bg-white p-3">
            <summary className="cursor-pointer font-semibold text-surface-900">{String(index + 1).padStart(2, '0')} · {entry.question || 'Nova pergunta'}</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-surface-700">{entry.answer || 'A resposta aparecerá aqui.'}</p>
          </details>)}
        </div>
      </aside>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
  </section>;
}
