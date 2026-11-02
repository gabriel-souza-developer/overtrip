import { useEffect, useState } from 'react';
import { knowledgeApi, type KnowledgeEntry, type KnowledgeVersion, type KnowledgeVersionSummary } from '../api';

export default function AssistantKnowledgeSettings() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<KnowledgeVersionSummary[]>([]);
  const [viewed, setViewed] = useState<KnowledgeVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [current, versions] = await Promise.all([knowledgeApi.current(), knowledgeApi.versions()]);
      setVersion(current?.version ?? null); setEntries(current?.entries ?? []); setHistory(versions); setViewed(null); setLoaded(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar a base.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const update = (index: number, field: keyof KnowledgeEntry, value: string) => {
    setEntries(previous => previous.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (entries.some(entry => !entry.question.trim() || !entry.answer.trim())) {
      setError('Preencha a pergunta e a resposta de cada item.'); return;
    }
    setSaving(true);
    try {
      const result = await knowledgeApi.approve(entries, version);
      setEntries(result.entries); setVersion(result.version); setViewed(null);
      setHistory(previous => [{ version: result.version, approvedAt: result.approvedAt, approvedById: result.approvedById }, ...previous].slice(0, 100));
      setMessage(`Versão ${result.version} aprovada.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível aprovar a base.'); }
    finally { setSaving(false); }
  };

  return <section className="card p-5 sm:p-6 space-y-5" aria-labelledby="knowledge-title">
    <div><h2 id="knowledge-title" className="text-lg font-semibold text-surface-900">Conhecimento do assistente</h2>
      <p className="text-sm text-surface-600 mt-1">Cadastre informações revisadas para o futuro atendimento. Aprovar cria uma nova versão completa; o assistente ainda não está conectado.</p>
      <p className="text-sm text-surface-600 mt-1">{version === null ? 'Nenhuma versão aprovada.' : `Versão atual: ${version}.`}</p></div>
    <form onSubmit={save} className="space-y-4">
      {entries.map((entry, index) => <fieldset key={index} className="space-y-2 border border-surface-200 rounded-lg p-3" disabled={loading || saving}>
        <legend className="text-sm font-semibold">Item {index + 1}</legend>
        <label className="label" htmlFor={`knowledge-question-${index}`}>Pergunta</label>
        <input id={`knowledge-question-${index}`} className="input" maxLength={300} value={entry.question} onChange={e => update(index, 'question', e.target.value)} />
        <label className="label" htmlFor={`knowledge-answer-${index}`}>Resposta aprovada</label>
        <textarea id={`knowledge-answer-${index}`} className="input" rows={3} maxLength={3000} value={entry.answer} onChange={e => update(index, 'answer', e.target.value)} />
        <button className="text-sm text-red-700" type="button" onClick={() => setEntries(previous => previous.filter((_, i) => i !== index))}>Remover item {index + 1}</button>
      </fieldset>)}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-secondary" disabled={!loaded || loading || saving || entries.length >= 100} onClick={() => setEntries(previous => [...previous, { question: '', answer: '' }])}>Adicionar pergunta</button>
        <button type="submit" className="btn-primary" disabled={!loaded || loading || saving}>{saving ? 'Aprovando...' : 'Aprovar nova versão'}</button>
        <button type="button" className="btn-secondary" disabled={loading || saving} onClick={() => void load()}>Recarregar base</button>
      </div>
      <p className="text-sm text-surface-600">Recarregar descarta as alterações ainda não aprovadas. Uma versão sem itens deixa a base vazia.</p>
    </form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {history.length > 0 && <div className="space-y-2"><h3 className="font-semibold">Histórico de aprovações</h3>
      <select aria-label="Consultar versão anterior" className="select" value={viewed?.version ?? ''} onChange={e => {
        const selected = Number(e.target.value);
        if (!selected) { setViewed(null); return; }
        knowledgeApi.version(selected).then(setViewed).catch(err => setError(err instanceof Error ? err.message : 'Não foi possível carregar a versão.'));
      }}><option value="">Selecione uma versão</option>{history.map(item => <option key={item.version} value={item.version}>Versão {item.version} — {new Date(item.approvedAt).toLocaleString('pt-BR')}</option>)}</select>
      {viewed && <div className="text-sm space-y-2"><p>Versão {viewed.version} · aprovador: {viewed.approvedById}</p>{viewed.entries.length === 0 ? <p>Base vazia.</p> : viewed.entries.map((entry, index) => <div key={index}><strong>{entry.question}</strong><p className="whitespace-pre-wrap">{entry.answer}</p></div>)}</div>}
    </div>}
  </section>;
}
