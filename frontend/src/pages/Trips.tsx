import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BusFront, CopyPlus, Download, Eye, EyeOff, MapPin, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { tripApi, tripTemplateApi, Trip, TripTemplateSummary, Pagination as PaginationInfo } from '../api';
import { useToast } from '../hooks/useToast';
import { useListParams } from '../hooks/useListParams';
import { publishProblems, TRIP_STATUS_LABELS, tripListAction, tripStatusLabel, tripStatusTone } from '../lib/panelHelpers';
import { canChangeTripStatus } from '../lib/permissions';
import { useAuth } from '../App';
import { formatDateBR } from '../lib/dateInput';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import RowMenu from '../components/RowMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const formatDate = formatDateBR;

// Abas da lista: o endereço guarda `period`; sem ele, mostram-se as próximas saídas.
type Period = 'upcoming' | 'past' | 'all';
const PERIODS: Array<{ value: Period; label: string; hint: string }> = [
  { value: 'upcoming', label: 'Próximas', hint: 'Saída hoje ou depois' },
  { value: 'past', label: 'Anteriores', hint: 'Já aconteceram' },
  { value: 'all', label: 'Todas', hint: 'Lista completa' },
];
const readPeriod = (value: string): Period => (value === 'past' || value === 'all' ? value : 'upcoming');

export default function Trips() {
  useDocumentTitle('Viagens');
  const [shadeDrafts, setShadeDrafts] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = canChangeTripStatus(user?.role);
  const list = useListParams();
  const { toast } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Trip | null>(null);
  const [toUnpublish, setToUnpublish] = useState<Trip | null>(null);
  const [incomplete, setIncomplete] = useState<{ trip: Trip; problems: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [templates, setTemplates] = useState<TripTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState('');
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [downloadingTemplateId, setDownloadingTemplateId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<TripTemplateSummary | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<Trip | null>(null);

  const status = list.get('status');
  const search = list.get('search');
  const period = readPeriod(list.get('period'));
  const { page } = list;

  const loadTrips = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await tripApi.list({ page, limit: 20, status: status || undefined, search: search || undefined, period: period === 'all' ? undefined : period } as Record<string, string | number>);
      setTrips(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as viagens.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, [page, status, search, period]);

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      const { data } = await tripTemplateApi.list();
      setTemplates(data);
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : 'Não foi possível carregar os modelos.');
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const openTemplate = (id: string) => navigate(`/trips/new?modeloSalvo=${encodeURIComponent(id)}`);

  const saveTemplate = async (trip: Trip) => {
    setSavingTemplateId(trip.id);
    try {
      await tripTemplateApi.save(trip.id, trip.title);
      if (trip.status === 'DRAFT') setDraftToDelete(trip);
      else toast.success('Modelo salvo.');
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o modelo.');
    } finally {
      setSavingTemplateId(null);
    }
  };

  const downloadTemplate = async (template: TripTemplateSummary) => {
    setDownloadingTemplateId(template.id);
    try {
      const detail = await tripTemplateApi.get(template.id);
      const blob = new Blob([JSON.stringify(detail.snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = detail.name.toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
      link.href = url;
      link.download = `${filename || 'modelo-de-viagem'}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível baixar o modelo.');
    } finally {
      setDownloadingTemplateId(null);
    }
  };

  const removeTemplate = async () => {
    if (!templateToDelete) return;
    setDeletingTemplate(true);
    try {
      await tripTemplateApi.delete(templateToDelete.id);
      setTemplateToDelete(null);
      toast.success('Modelo excluído.');
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir o modelo.');
    } finally {
      setDeletingTemplate(false);
    }
  };

  const publish = async (trip: Trip) => {
    // Mesma regra do formulário: sem foto (ou sem valor) a viagem não vai para o site.
    const problems = publishProblems(trip);
    if (problems.length > 0) {
      setIncomplete({ trip, problems });
      return;
    }
    setPublishingId(trip.id);
    try {
      await tripApi.publish(trip.id);
      toast.success(`“${trip.title}” já está no site.`);
      await loadTrips();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível publicar a viagem.');
    } finally {
      setPublishingId(null);
    }
  };

  const unpublish = async () => {
    if (!toUnpublish) return;
    setPublishingId(toUnpublish.id);
    try {
      await tripApi.unpublish(toUnpublish.id);
      toast.success(`“${toUnpublish.title}” saiu do site e voltou a ser rascunho.`);
      setToUnpublish(null);
      await loadTrips();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível tirar a viagem do site.');
    } finally {
      setPublishingId(null);
    }
  };

  const remove = async () => {
    const trip = draftToDelete ?? toDelete;
    if (!trip) return;
    setDeleting(true);
    try {
      await tripApi.delete(trip.id);
      toast.success(draftToDelete ? 'Rascunho excluído. Modelo mantido.' : 'Viagem excluída.');
      setToDelete(null);
      setDraftToDelete(null);
      // Se era a última da página, volta uma página.
      if (trips.length === 1 && page > 1) list.setPage(page - 1);
      else await loadTrips();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir a viagem.');
    } finally {
      setDeleting(false);
    }
  };

  const hasFilters = !!(search || status);
  const emptyCopy = hasFilters
    ? { title: 'Nenhuma viagem encontrada', text: 'Tente outra busca ou limpe os filtros.' }
    : period === 'upcoming'
      ? { title: 'Nenhuma próxima viagem', text: 'As viagens que já aconteceram ficam em “Anteriores”. Cadastre a próxima saída.' }
      : period === 'past'
        ? { title: 'Nenhuma viagem anterior', text: 'Quando uma saída passar da data, ela aparece aqui.' }
        : { title: 'Você ainda não criou nenhuma viagem', text: 'Comece pelo básico: nome, local, data, valor e uma foto.' };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Viagens"
        description="Crie, publique e organize as viagens do site"
        actions={<Link to="/trips/new" className="btn-primary"><Plus className="w-5 h-5" aria-hidden="true" /> Nova viagem</Link>}
      />

      <section className="card p-5 space-y-3" aria-labelledby="trip-templates-heading">
        <h2 id="trip-templates-heading" className="text-lg font-semibold text-surface-900">Modelos salvos</h2>
        {templatesLoading ? (
          <p className="text-sm text-surface-600" role="status">Carregando modelos…</p>
        ) : templatesError ? (
          <ErrorState message={templatesError} onRetry={loadTemplates} />
        ) : templates.length === 0 ? (
          <p className="text-sm text-surface-600">Selecione “Salvar como modelo” em uma viagem para adicioná-la aqui.</p>
        ) : (
          <ul className="divide-y divide-surface-200">
            {templates.map(template => (
              <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="font-medium text-surface-900">{template.name}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button small onClick={() => openTemplate(template.id)} aria-label={`Usar modelo ${template.name}`}>Usar</Button>
                  <Button small icon={<Download className="w-4 h-4" aria-hidden="true" />} onClick={() => downloadTemplate(template)} loading={downloadingTemplateId === template.id} disabled={!!downloadingTemplateId} loadingText="Baixando…" aria-label={`Baixar JSON do modelo ${template.name}`}>Baixar JSON</Button>
                  <Button small variant="ghost" icon={<Trash2 className="w-4 h-4" aria-hidden="true" />} onClick={() => setTemplateToDelete(template)} aria-label={`Excluir modelo ${template.name}`}>Excluir</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Período das viagens">
        {PERIODS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={period === option.value}
            title={option.hint}
            onClick={() => list.setFilter('period', option.value === 'upcoming' ? '' : option.value)}
            className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${period === option.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-surface-300 bg-white text-surface-800 hover:border-primary-300'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <FilterBar
        searchLabel="Buscar viagens"
        searchPlaceholder="Buscar por nome, cidade ou categoria"
        searchValue={search}
        onSearch={(value) => list.setFilter('search', value)}
        onClear={() => list.clear(['period'])}
        hasFilters={hasFilters}
      >
        <select className="select w-full lg:w-52" value={status} onChange={(e) => list.setFilter('status', e.target.value)} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          {Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="inline-flex min-h-10 items-center gap-2 text-sm text-surface-800">
          <input type="checkbox" checked={shadeDrafts} onChange={event => setShadeDrafts(event.target.checked)} />
          Escurecer rascunhos
        </label>
      </FilterBar>

      {error ? <ErrorState message={error} onRetry={loadTrips} /> : null}

      <div className="card" aria-busy={loading}>
        {loading && trips.length === 0 ? (
          <div className="p-4 space-y-3" aria-label="Carregando viagens">
            {[1, 2, 3, 4].map((i) => <div key={i} className="loading-skeleton h-12 w-full" />)}
          </div>
        ) : trips.length === 0 && !error ? (
          <EmptyState
            icon={<BusFront className="w-6 h-6" />}
            title={emptyCopy.title}
            text={emptyCopy.text}
            action={hasFilters
              ? <Button onClick={() => list.clear(['period'])}>Limpar filtros</Button>
              : period === 'past'
                ? <Button onClick={() => list.setFilter('period', '')}>Ver próximas viagens</Button>
                : <Link to="/trips/new" className="btn-primary"><Plus className="w-5 h-5" aria-hidden="true" /> {period === 'upcoming' ? 'Cadastrar a próxima viagem' : 'Criar a primeira viagem'}</Link>}
          />
        ) : (
          <div className={`table-container ${loading ? 'opacity-60' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Viagem</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="hidden md:table-cell">{period === 'past' ? 'Foi em' : 'Saída'}</th>
                  <th scope="col" className="hidden lg:table-cell">Local</th>
                  <th scope="col"><span className="visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => {
                  const action = tripListAction(trip.status, isAdmin);
                  const canPublish = action === 'publish';
                  const busy = publishingId === trip.id;
                  return (
                    <tr key={trip.id} className={shadeDrafts && trip.status === 'DRAFT' ? 'bg-surface-200' : undefined}>
                      <td className="max-w-[16rem]">
                        <Link to={`/trips/${trip.id}/edit`} className="font-medium text-surface-900 hover:text-primary-800 hover:underline">{trip.title}</Link>{trip.tripProfile === 'OVER_RIDERS' && <span className="ml-2 badge-info">OVER RIDERS</span>}
                        <p className="md:hidden text-xs text-surface-600 mt-0.5">{formatDate(trip.startDateISO)} · {trip.city}/{trip.region}</p>
                      </td>
                      <td><StatusBadge tone={tripStatusTone(trip.status)}>{tripStatusLabel(trip.status)}</StatusBadge></td>
                      <td className="hidden md:table-cell text-surface-700 whitespace-nowrap">{formatDate(trip.startDateISO)}</td>
                      <td className="hidden lg:table-cell text-surface-700">
                        <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4 text-surface-500" aria-hidden="true" />{trip.city}/{trip.region}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {action && (
                          <Button
                              small
                              disabled={savingTemplateId === trip.id}
                              variant={canPublish ? 'primary' : 'secondary'}
                              loading={busy}
                              loadingText={canPublish ? 'Publicando...' : 'Tirando...'}
                              icon={canPublish ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
                              onClick={() => (canPublish ? publish(trip) : setToUnpublish(trip))}
                              aria-label={`${canPublish ? 'Publicar no site' : 'Tirar do site'}: ${trip.title}`}
                            >
                              <span className="hidden sm:inline">{canPublish ? 'Publicar' : 'Tirar do site'}</span>
                            </Button>
                          )}
                          <RowMenu
                            label={`Mais opções de ${trip.title}`}
                            items={[
                              { key: 'edit', label: 'Editar', icon: <Pencil className="w-4 h-4" aria-hidden="true" />, onSelect: () => { navigate(`/trips/${trip.id}/edit`); } },
                              { key: 'reuse', label: 'Usar como modelo', icon: <CopyPlus className="w-4 h-4" aria-hidden="true" />, onSelect: () => { navigate(`/trips/new?modelo=${encodeURIComponent(trip.id)}`); } },
                              { key: 'save-template', label: 'Salvar como modelo', icon: <Save className="w-4 h-4" aria-hidden="true" />, disabled: !!savingTemplateId || busy, onSelect: () => { void saveTemplate(trip); } },
                              { key: 'delete', label: 'Excluir', danger: true, icon: <Trash2 className="w-4 h-4" aria-hidden="true" />, onSelect: () => setToDelete(trip) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={pagination} onChange={list.setPage} />
      </div>

      <ConfirmDialog
        open={!!draftToDelete}
        onOpenChange={(open) => { if (!open) setDraftToDelete(null); }}
        title="Excluir o rascunho original?"
        description="Modelo salvo no banco. Deseja excluir o rascunho original? O modelo continuará salvo."
        cancelLabel="Manter rascunho"
        confirmLabel="Excluir rascunho"
        busyLabel="Excluindo…"
        busy={deleting}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={!!templateToDelete}
        onOpenChange={(open) => { if (!open) setTemplateToDelete(null); }}
        title="Excluir este modelo?"
        description={`“${templateToDelete?.name ?? ''}” será removido dos modelos salvos.`}
        confirmLabel="Excluir modelo"
        busyLabel="Excluindo…"
        busy={deletingTemplate}
        onConfirm={removeTemplate}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        title="Excluir esta viagem?"
        description={`“${toDelete?.title ?? ''}” será apagada de vez e sai do site. Isso não pode ser desfeito.`}
        confirmLabel="Sim, excluir"
        busyLabel="Excluindo..."
        busy={deleting}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={!!incomplete}
        onOpenChange={(open) => { if (!open) setIncomplete(null); }}
        title="Ainda falta algo para publicar"
        description={`“${incomplete?.trip.title ?? ''}”: ${incomplete?.problems.join(' ') ?? ''}`}
        confirmLabel="Abrir a viagem"
        danger={false}
        onConfirm={() => { const id = incomplete?.trip.id; setIncomplete(null); if (id) navigate(`/trips/${id}/edit`); }}
      />
      <ConfirmDialog
        open={!!toUnpublish}
        onOpenChange={(open) => { if (!open) setToUnpublish(null); }}
        title="Tirar do site?"
        description={`“${toUnpublish?.title ?? ''}” deixa de aparecer para os clientes e volta a ser rascunho. Você pode publicar de novo quando quiser.`}
        confirmLabel="Tirar do site"
        busyLabel="Tirando..."
        busy={!!toUnpublish && publishingId === toUnpublish.id}
        danger={false}
        onConfirm={unpublish}
      />
    </div>
  );
}
