import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CopyPlus, Eye, EyeOff, MapPin, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import { tripApi, Trip, TripStatus, Pagination as PaginationInfo } from '../api';
import { useToast } from '../hooks/useToast';
import { useListParams } from '../hooks/useListParams';
import { publishProblems, TRIP_STATUS_LABELS, tripListAction, tripStatusLabel } from '../lib/panelHelpers';
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

const statusColors: Record<TripStatus, string> = {
  DRAFT: 'badge-neutral',
  REVIEW: 'badge-warning',
  OPEN: 'badge-success',
  COMPLETED: 'badge-info',
  CANCELLED: 'badge-danger',
  SOLD_OUT: 'badge-warning',
  CLOSED: 'badge-neutral',
};

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
    if (!toDelete) return;
    setDeleting(true);
    try {
      await tripApi.delete(toDelete.id);
      toast.success('Viagem excluída.');
      setToDelete(null);
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

      <div className="flex flex-wrap gap-2" role="group" aria-label="Período das viagens">
        {PERIODS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={period === option.value}
            title={option.hint}
            onClick={() => list.setFilter('period', option.value === 'upcoming' ? '' : option.value)}
            className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${period === option.value ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-300 bg-white text-surface-800 hover:border-primary-300'}`}
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
      </FilterBar>

      {error ? <ErrorState message={error} onRetry={loadTrips} /> : null}

      <div className="card" aria-busy={loading}>
        {loading && trips.length === 0 ? (
          <div className="p-4 space-y-3" aria-label="Carregando viagens">
            {[1, 2, 3, 4].map((i) => <div key={i} className="loading-skeleton h-12 w-full" />)}
          </div>
        ) : trips.length === 0 && !error ? (
          <EmptyState
            icon={<Plane className="w-6 h-6" />}
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
                    <tr key={trip.id}>
                      <td className="max-w-[16rem]">
                        <Link to={`/trips/${trip.id}/edit`} className="font-medium text-surface-900 hover:text-primary-500 hover:underline">{trip.title}</Link>
                        <p className="md:hidden text-xs text-surface-600 mt-0.5">{formatDate(trip.startDateISO)} · {trip.city}/{trip.region}</p>
                      </td>
                      <td><span className={statusColors[trip.status]}>{tripStatusLabel(trip.status)}</span></td>
                      <td className="hidden md:table-cell text-surface-700 whitespace-nowrap">{formatDate(trip.startDateISO)}</td>
                      <td className="hidden lg:table-cell text-surface-700">
                        <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4 text-surface-500" aria-hidden="true" />{trip.city}/{trip.region}</span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {action && (
                          <Button
                              small
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
