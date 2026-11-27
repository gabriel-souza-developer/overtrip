import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Plus, UsersRound } from 'lucide-react';
import { tripApi, type Trip } from '../api';
import { passengerApi, PASSENGER_PAYMENT_LABELS, type PassengerPaymentStatus, type PassengerProfile, type PassengerTripRow } from '../api/passengers';
import { useToast } from '../hooks/useToast';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import Field from '../components/Field';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
};
type PassengerForm = { profileId: string; fullName: string; phone: string; document: string; emergencyContact: string; email: string };
const emptyForm: PassengerForm = { profileId: '', fullName: '', phone: '', document: '', emergencyContact: '', email: '' };

export default function Passengers() {
  useDocumentTitle('Passageiros');
  const { toast } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState('');
  const [rows, setRows] = useState<PassengerTripRow[]>([]);
  const [profiles, setProfiles] = useState<PassengerProfile[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<PassengerForm>(emptyForm);
  const [privateDetails, setPrivateDetails] = useState<Record<string, { document: string | null; emergencyContact: string | null; email: string | null }>>({});
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadTripData = useCallback(async () => {
    if (!tripId) { setRows([]); return; }
    try { const result = await passengerApi.trip(tripId); setRows(result.data); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os passageiros da TRIP.'); }
  }, [tripId]);

  const loadDirectory = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [tripList, profileList] = await Promise.all([
        // Sem `period`, a API retorna TRIPs futuras e anteriores (o filtro aceita
        // apenas `upcoming` ou `past`; “todas” é representado pela ausência do campo).
        tripApi.list({ page: 1, limit: 100 }),
        passengerApi.profiles(search),
      ]);
      setTrips(tripList.data); setProfiles(profileList.data);
      if (!tripId && tripList.data.length) setTripId(tripList.data[0].id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar a área de passageiros.'); }
    finally { setLoading(false); }
  }, [search, tripId]);

  useEffect(() => { void loadDirectory(); }, [loadDirectory]);
  useEffect(() => { void loadTripData(); }, [loadTripData]);

  const importWorkbook = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await passengerApi.importWorkbook(file);
      toast.success(`Importação concluída: ${result.profilesCreated + result.profilesMerged} perfis processados e ${result.legacyRowsRead} linhas antigas guardadas somente como histórico, sem vínculo a TRIP.`);
      setFile(null);
      await loadDirectory();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível importar a planilha.'); }
    finally { setBusy(false); }
  };

  const addPassenger = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tripId) return;
    const data = form.profileId ? { profileId: form.profileId } : {
      fullName: form.fullName, phone: form.phone || null, document: form.document || null,
      emergencyContact: form.emergencyContact || null, email: form.email || null,
    };
    setBusy(true);
    try {
      await passengerApi.add(tripId, data);
      setForm(emptyForm); toast.success('Passageiro adicionado à TRIP.'); await loadTripData(); await loadDirectory();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível adicionar o passageiro.'); }
    finally { setBusy(false); }
  };

  const update = async (row: PassengerTripRow, patch: Partial<Pick<PassengerTripRow, 'paymentStatus' | 'attended'>>) => {
    if (!tripId) return;
    try { await passengerApi.update(tripId, row.id, patch); await loadTripData(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível atualizar o passageiro.'); }
  };

  const loadPrivateDetails = async (rowId: string) => {
    if (!tripId || privateDetails[rowId]) return;
    try { const details = await passengerApi.privateDetails(tripId, rowId); setPrivateDetails(previous => ({ ...previous, [rowId]: details })); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível carregar os dados protegidos.'); }
  };

  const exportDriverList = async () => {
    if (!tripId) return;
    setBusy(true);
    try {
      const blob = await passengerApi.driverCsv(tripId);
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      const selectedTrip = trips.find(item => item.id === tripId);
      const slug = selectedTrip?.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
      link.href = url; link.download = `embarque-${slug}.csv`; link.click(); URL.revokeObjectURL(url);
      toast.success('Lista do motorista gerada. Ela contém somente nome e telefone.');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível gerar a lista.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="space-y-6"><PageHeader title="Passageiros" /><p role="status" className="text-sm text-surface-600">Carregando cadastros...</p></div>;
  return <div className="space-y-6">
    <PageHeader title="Passageiros" description="Cadastros reutilizáveis, lista por TRIP e acompanhamento de pagamento e presença." />
    {error && <ErrorState message={error} onRetry={() => { void loadDirectory(); void loadTripData(); }} />}

    <section className="card p-5 space-y-3" aria-labelledby="passenger-import-title">
      <div className="flex items-start gap-3"><FileSpreadsheet className="mt-1 h-5 w-5 text-primary-700" aria-hidden="true" /><div><h2 id="passenger-import-title" className="font-semibold text-surface-900">Importar cadastros da planilha</h2><p className="mt-1 text-sm text-surface-600">Escolha “Forms de passageiros CG TRIP.xlsx”. Os perfis ficam disponíveis para novas TRIPs. Pagamentos e presenças da lista antiga são guardados somente como histórico, sem associação a nenhuma TRIP.</p></div></div>
      <div className="flex flex-wrap items-end gap-3"><Field id="passenger-workbook" label="Planilha de passageiros" hint="O arquivo é processado sem ser guardado no servidor."><input id="passenger-workbook" className="input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field><Button variant="primary" disabled={!file || busy} loading={busy} loadingText="Importando..." onClick={() => void importWorkbook()}>Importar cadastros</Button></div>
      <p className="text-xs text-surface-500">CPF/RG, telefone, e-mail e contato de emergência ficam cifrados no banco e visíveis apenas a administradores. A lista do motorista contém somente nome e telefone.</p>
    </section>

    <section className="card p-5 space-y-4" aria-labelledby="trip-roster-title">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="trip-roster-title" className="font-semibold text-surface-900">Lista de passageiros por TRIP</h2><p className="mt-1 text-sm text-surface-600">A lista é operacional; valores/status daqui não são somados ao Financeiro.</p></div><div className="flex flex-wrap items-end gap-2"><Field id="passenger-trip-select" label="TRIP"><select id="passenger-trip-select" className="input min-w-64" value={tripId} onChange={event => setTripId(event.target.value)}><option value="">Selecione a TRIP</option>{trips.map(trip => <option key={trip.id} value={trip.id}>{trip.title} · {dateLabel(trip.startDateISO)}</option>)}</select></Field><Button icon={<Download className="h-4 w-4" aria-hidden="true" />} disabled={!tripId || busy || rows.length === 0} onClick={() => void exportDriverList()}>Lista do motorista</Button></div></div>
      {!tripId ? <EmptyState icon={<UsersRound />} title="Selecione uma TRIP" text="A lista de embarque e o acompanhamento aparecem aqui." /> : rows.length === 0 ? <EmptyState icon={<UsersRound />} title="Nenhum passageiro vinculado" text="Adicione pessoas do cadastro ou faça um novo cadastro abaixo." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-surface-200 text-xs text-surface-600"><th className="py-2 pr-3">Passageiro</th><th className="py-2 pr-3">Pagamento</th><th className="py-2 pr-3">Presença</th><th className="py-2">Dados protegidos</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-surface-100 align-top"><td className="py-3 pr-3"><strong>{row.profile.fullName}</strong>{row.profile.phone && <p className="mt-1 text-xs text-surface-600">{row.profile.phone}</p>}</td><td className="py-3 pr-3"><select className="input" aria-label={`Pagamento de ${row.profile.fullName}`} value={row.paymentStatus || ''} onChange={event => void update(row, { paymentStatus: (event.target.value || null) as PassengerPaymentStatus | null })}><option value="">Não informado</option>{Object.entries(PASSENGER_PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{row.paymentLabel && <p className="mt-1 text-xs text-surface-500">Planilha: {row.paymentLabel}</p>}{row.amountCents !== null && <p className="mt-1 text-xs text-surface-500">Valor anotado: {money(row.amountCents)}</p>}</td><td className="py-3 pr-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={row.attended === true} ref={element => { if (element) element.indeterminate = row.attended === null; }} onChange={event => void update(row, { attended: event.target.checked })} /><span>{row.attended === null ? 'Marcar presença' : row.attended ? 'Presente' : 'Ausente'}</span></label></td><td className="py-3"><details onToggle={event => { if (event.currentTarget.open) void loadPrivateDetails(row.id); }}><summary className="cursor-pointer text-primary-800">Ver para a equipe</summary><div className="mt-2 space-y-1 text-xs text-surface-600">{privateDetails[row.id]?.document && <p>CPF/RG: {privateDetails[row.id].document}</p>}{privateDetails[row.id]?.email && <p>E-mail: {privateDetails[row.id].email}</p>}{privateDetails[row.id]?.emergencyContact && <p>Emergência: {privateDetails[row.id].emergencyContact}</p>}{!privateDetails[row.id] && <p>Carregando dados protegidos…</p>}</div></details></td></tr>)}</tbody></table></div>}
    </section>

    <section className="card p-5 space-y-4" aria-labelledby="add-passenger-title">
      <div><h2 id="add-passenger-title" className="font-semibold text-surface-900">Adicionar passageiro à TRIP</h2><p className="mt-1 text-sm text-surface-600">Busque o cadastro de alguém que já viajou ou preencha os dados de uma nova pessoa. A entrada nesta TRIP começa com pagamento e presença em branco.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field id="passenger-search" label="Buscar cliente no cadastro"><input id="passenger-search" className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do passageiro" /></Field><Field id="passenger-profile" label="Cliente existente"><select id="passenger-profile" className="input" value={form.profileId} onChange={event => { const selected = profiles.find(profile => profile.id === event.target.value); setForm(selected ? { ...emptyForm, profileId: selected.id, fullName: selected.fullName, phone: selected.phone || '' } : emptyForm); }}><option value="">Cadastrar uma nova pessoa</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.fullName}{profile.phone ? ` · ${profile.phone}` : ''}</option>)}</select></Field></div>
      <form className="space-y-4" onSubmit={event => void addPassenger(event)}><div className="grid gap-4 sm:grid-cols-2"><Field id="passenger-name" label="Nome completo" required><input id="passenger-name" className="input" required maxLength={150} value={form.fullName} disabled={!!form.profileId} onChange={event => setForm({ ...form, fullName: event.target.value })} /></Field><Field id="passenger-phone" label="Telefone"><input id="passenger-phone" className="input" type="tel" value={form.phone} disabled={!!form.profileId} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field><Field id="passenger-document" label="CPF ou RG"><input id="passenger-document" className="input" value={form.document} disabled={!!form.profileId} onChange={event => setForm({ ...form, document: event.target.value })} /></Field><Field id="passenger-emergency" label="Contato de emergência"><input id="passenger-emergency" className="input" value={form.emergencyContact} disabled={!!form.profileId} onChange={event => setForm({ ...form, emergencyContact: event.target.value })} /></Field></div><Button type="submit" variant="primary" disabled={!tripId || busy} loading={busy} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>Adicionar à TRIP</Button></form>
    </section>
  </div>;
}
