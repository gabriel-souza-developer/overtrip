import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { CopyPlus, Pencil, Plane, Plus, Trash2, X } from 'lucide-react';
import { organizationApi, type OrgTrip, type OrgTripDetail, type OrgTripEssentials, type OrgTripIntensity } from '../api/organizations';
import { createOrganizationDocumentApi } from '../api/organizationTripDocuments';
import { TRIP_STATUS_LABELS, tripStatusLabel, tripStatusTone, parsePriceInput, formatPriceInput } from '../lib/panelHelpers';
import { formatBRL, syncPriceDisplay } from '../lib/formHelpers';
import { toLocalDateTime, fromLocalDateTime } from '../lib/organizationDateTime';
import { prepareOrgTripTemplate } from '../lib/tripTemplate';
import type { OrganizationOutletContext } from './OrganizationLayout';
import { ArrayInput, DeparturesInput, type Departure } from '../components/TripFormInputs';
import { customItems, hasItem, INCLUDE_PRESETS, mergeUnique, togglePreset } from '../lib/includesServices';
import { customImportantInfo, FILTER_CATEGORY_OPTIONS, hasImportantInfoPreset, IMPORTANT_INFO_PRESETS, toggleImportantInfoPreset } from '../lib/tripFormOptions';
import { applySuggestions, type DraftKey, type TripDraft } from '../lib/aiDraft';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Field from '../components/Field';
import FilterBar from '../components/FilterBar';
import ImageUploader from '../components/ImageUploader';
import ConfirmDialog from '../components/ConfirmDialog';
import TripDocuments from '../components/TripDocuments';
import TripCardPreview from '../components/TripCardPreview';
import TripProposalPreview from '../components/TripProposalPreview';
import StatusBadge from '../components/StatusBadge';
import AiDraftBlock from '../components/AiDraftBlock';

const CAN_MANAGE_TRIPS = (role: string) => role === 'OWNER' || role === 'ADMIN';
const INTENSITY_OPTIONS: OrgTripIntensity[] = ['leve', 'moderado', 'intenso', 'extremo'];

// previewSrc opcional (não no tipo de leitura da API, que sempre o traz):
// uma foto recém-adicionada pelo ImageUploader já chega com previewSrc, mas
// o tipo precisa aceitar os dois casos antes de salvar.
type TripMediaForm = { src: string; alt: string; previewSrc?: string; focus?: string };
const stripPreview = ({ src, alt, focus }: TripMediaForm): { src: string; alt: string; focus?: string } => ({ src, alt, ...(focus ? { focus } : {}) });

// A IA sugere só a data (AAAA-MM-DD, ver aiTripDraft.ts); o campo desta tela
// é datetime-local (data e hora juntas). Mantém a hora já digitada, ou meia-noite
// se ainda não há nenhuma.
const mergeSuggestedDate = (current: string, suggestedDate: string): string => {
  const time = current.includes('T') ? current.slice(current.indexOf('T') + 1) : '00:00';
  return `${suggestedDate}T${time}`;
};

interface TripForm {
  title: string; category: string; description: string; city: string; region: string; startDateISO: string; endDateISO: string;
  headlineDisplay: string; filterCategory: string;
  departureTime: string; departureTolerance: string; returnTime: string; scheduleInfo: string; scheduleTBD: boolean;
  priceValue: number | null; priceDisplay: string; priceUnit: string; free: boolean;
  intensityClass: OrgTripIntensity; spotsLeft: string;
  trailDistance: string; supportPoint: string; supportPointInfo: string;
  meetingCity: string; meetingPoint: string; meetingTBD: boolean; meetingDetails: string; meetingMapsQuery: string;
  includes: string[]; includesHighlight: string; itinerary: string[]; routeNotes: string[]; importantInfo: string[];
  media: TripMediaForm[]; departures: Departure[];
}
const emptyForm: TripForm = {
  title: '', category: '', description: '', city: '', region: '', startDateISO: '', endDateISO: '',
  headlineDisplay: '', filterCategory: '',
  departureTime: '', departureTolerance: '', returnTime: '', scheduleInfo: '', scheduleTBD: false,
  priceValue: null, priceDisplay: '', priceUnit: 'por pessoa', free: false,
  intensityClass: 'moderado', spotsLeft: '',
  trailDistance: '', supportPoint: '', supportPointInfo: '',
  meetingCity: '', meetingPoint: '', meetingTBD: false, meetingDetails: '', meetingMapsQuery: '',
  includes: [], includesHighlight: '', itinerary: [], routeNotes: [], importantInfo: [],
  media: [], departures: [],
};
const formFromDetail = (trip: OrgTripDetail): TripForm => ({
  title: trip.title, category: trip.category, description: trip.description, city: trip.city, region: trip.region,
  startDateISO: toLocalDateTime(trip.startDateISO), endDateISO: toLocalDateTime(trip.endDateISO),
  headlineDisplay: trip.headlineDisplay ?? '', filterCategory: trip.filterCategory ?? '',
  departureTime: trip.departureTime ?? '', departureTolerance: trip.departureTolerance ?? '', returnTime: trip.returnTime ?? '',
  scheduleInfo: trip.scheduleInfo ?? '', scheduleTBD: trip.scheduleTBD,
  priceValue: trip.priceValue, priceDisplay: trip.priceDisplay ?? '', priceUnit: trip.priceUnit, free: trip.free,
  intensityClass: trip.intensityClass, spotsLeft: trip.spotsLeft !== null ? String(trip.spotsLeft) : '',
  trailDistance: trip.trailDistance ?? '', supportPoint: trip.supportPoint ?? '', supportPointInfo: trip.supportPointInfo ?? '',
  meetingCity: trip.meetingCity ?? '', meetingPoint: trip.meetingPoint ?? '', meetingTBD: trip.meetingTBD,
  meetingDetails: trip.meetingDetails ?? '', meetingMapsQuery: trip.meetingMapsQuery ?? '',
  includes: trip.includes, includesHighlight: trip.includesHighlight ?? '', itinerary: trip.itinerary, routeNotes: trip.routeNotes, importantInfo: trip.importantInfo,
  media: trip.media, departures: trip.departures.map(({ time, place, city, mapsUrl, mapsQuery }, orderIndex) => ({ time, place, city, mapsUrl, mapsQuery, orderIndex })),
});

export default function OrganizationTrips() {
  const { organization, role } = useOutletContext<OrganizationOutletContext>();
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();
  const canManage = CAN_MANAGE_TRIPS(role);
  const [trips, setTrips] = useState<OrgTrip[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => urlParams.get('status') ?? '');
  const [period, setPeriod] = useState<'upcoming' | 'past' | 'all'>(() => urlParams.get('period') === 'all' ? 'all' : urlParams.get('period') === 'past' ? 'past' : 'upcoming');

  const [editing, setEditing] = useState<OrgTripDetail | null>(null);
  const [creating, setCreating] = useState(false);
  // Preenchido só quando o rascunho foi aberto por "Usar como modelo"
  // (viagem própria usada de base): controla o aviso e o título do
  // formulário. editing permanece null — é sempre um rascunho NOVO, nunca
  // uma atualização da viagem de origem.
  const [templateSource, setTemplateSource] = useState<OrgTrip | null>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);
  // Ignora respostas atrasadas quando outra ação abre um formulário.
  const editRequestVersion = useRef(0);
  const [toDelete, setToDelete] = useState<OrgTrip | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [form, setForm] = useState<TripForm>(emptyForm);
  const [optionsOpen, setOptionsOpen] = useState({ essential: false, departure: false, experience: false, trail: false });
  const optionsFor = (value: TripForm) => ({
    essential: !!value.headlineDisplay.trim() || !!value.filterCategory.trim() || (!!value.priceDisplay.trim() && value.priceDisplay.trim() !== (value.priceValue ? formatBRL(value.priceValue) : '')),
    departure: !!value.scheduleInfo.trim() || !!value.meetingMapsQuery.trim(),
    experience: !!value.includesHighlight.trim(),
    trail: !!value.trailDistance.trim() || !!value.supportPoint.trim() || !!value.supportPointInfo.trim(),
  });
  const [priceText, setPriceText] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // Mesmo padrão de TripForm.tsx (legado): texto digitado em "O que inclui",
  // itinerário, observações, informações importantes, embarques ou uma foto
  // ainda em envio não é parte da lista até ser confirmado — sem isto,
  // salvar ou fechar o formulário nesse meio-tempo descartaria o texto sem
  // avisar.
  const [pendingItems, setPendingItems] = useState<Record<string, boolean>>({});
  const setPendingItem = (field: string, pending: boolean) => setPendingItems((previous) => (previous[field] === pending ? previous : { ...previous, [field]: pending }));
  const hasPendingItems = Object.values(pendingItems).some(Boolean);
  // Mesmo padrão de TripForm.tsx (legado): só pergunta antes de fechar quando
  // há algo que se perderia — snapshot tirado sempre que o formulário abre
  // (criar ou editar), comparado com o estado atual a cada render.
  const initialFormRef = useRef<string>(JSON.stringify(emptyForm));
  const dirty = JSON.stringify(form) !== initialFormRef.current || hasPendingItems;
  const editorOpen = creating || !!editing;
  const [discardOpen, setDiscardOpen] = useState(false);
  // true só quando a confirmação foi aberta pelo botão Voltar do navegador
  // (ver efeitos de popstate abaixo): aí sim o descarte deve completar a
  // navegação pendente; vindo de Cancelar/X/Esc, só fecha o modal.
  const backTriggeredRef = useRef(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const data = await organizationApi.trips(organization.id, { page, limit: 20, search, status, period: period === 'all' ? undefined : period });
      setTrips(data.data); setPagination(data.pagination);
    } catch (err) {
      setTrips([]);
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as viagens.');
    } finally { setLoading(false); }
  }, [organization.id, search, status, period]);
  useEffect(() => { void load(1); }, [load]);
  useEffect(() => () => { editRequestVersion.current++; }, [organization.id]);

  const openCreate = () => {
    editRequestVersion.current++;
    setLoadingEdit(null);
    // Prefill da unidade de preço com o padrão da empresa (Configurações),
    // igual ao formulário legado lendo os padrões globais: só o valor
    // inicial muda, viagens já criadas não são alteradas.
    const initial = organization.defaultPriceUnit?.trim() ? { ...emptyForm, priceUnit: organization.defaultPriceUnit.trim() } : emptyForm;
    setEditing(null); setTemplateSource(null); setCreating(true); setOptionsOpen(optionsFor(initial)); setForm(initial); setPriceText(''); setFormError(''); setPendingItems({}); initialFormRef.current = JSON.stringify(initial);
  };
  const openEdit = async (trip: OrgTrip) => {
    if (editorOpen && dirty) { setFormError('Salve ou descarte as alterações antes de abrir outra viagem.'); return; }
    const version = ++editRequestVersion.current;
    setLoadingEdit(trip.id);
    try {
      const detail = await organizationApi.trip(organization.id, trip.id);
      if (version !== editRequestVersion.current) return;
      const nextForm = formFromDetail(detail);
      setCreating(false); setEditing(detail); setTemplateSource(null); setFormError(''); setPendingItems({});
      setOptionsOpen(optionsFor(nextForm));
      setForm(nextForm);
      initialFormRef.current = JSON.stringify(nextForm);
      setPriceText(formatPriceInput(detail.priceValue));
    } catch (err) {
      if (version === editRequestVersion.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar a viagem.');
    } finally {
      if (version === editRequestVersion.current) setLoadingEdit(null);
    }
  };
  // "Usar como modelo": busca a viagem própria (status qualquer — inclusive
  // já publicada ou concluída) pela mesma rota de leitura já isolada por
  // empresa, e abre um rascunho NOVO com o conteúdo reaproveitável. Nunca
  // chama updateTrip: editing fica null, então save() sempre cria (POST),
  // que por sua vez sempre gera id/storedIdentity novos, força status DRAFT
  // e revalida a titularidade de cada foto (assertOwnedImages) — a viagem de
  // origem nunca é alterada, e nenhuma foto de outra empresa passaria dessa
  // revalidação mesmo que chegasse aqui. prepareOrgTripTemplate limpa data,
  // horário, vagas e embarques antigos antes de preencher a tela.
  const openTemplate = async (trip: OrgTrip) => {
    if (editorOpen && dirty) { setFormError('Salve ou descarte as alterações antes de usar outra viagem como modelo.'); return; }
    const version = ++editRequestVersion.current;
    setLoadingEdit(trip.id);
    try {
      const detail = await organizationApi.trip(organization.id, trip.id);
      if (version !== editRequestVersion.current) return;
      const templated = prepareOrgTripTemplate(formFromDetail(detail));
      setCreating(true); setEditing(null); setTemplateSource(trip); setFormError(''); setPendingItems({});
      setOptionsOpen(optionsFor(templated));
      setForm(templated);
      // Nada foi salvo ainda: qualquer tentativa de fechar deve avisar, por
      // isso a base de comparação é o formulário vazio (igual ao padrão já
      // usado por TripForm.tsx/legado no mesmo recurso), não o próprio
      // conteúdo copiado.
      initialFormRef.current = JSON.stringify(emptyForm);
      setPriceText(formatPriceInput(templated.priceValue));
    } catch (err) {
      if (version === editRequestVersion.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar a viagem para usar como modelo.');
    } finally {
      if (version === editRequestVersion.current) setLoadingEdit(null);
    }
  };
  const discardAndClose = () => {
    setCreating(false); setEditing(null); setTemplateSource(null); setForm(emptyForm); setPendingItems({}); setDiscardOpen(false);
    if (backTriggeredRef.current) { backTriggeredRef.current = false; navigate(-1); }
  };
  const closeForm = () => {
    if (saving) return;
    if (dirty) { setDiscardOpen(true); return; }
    discardAndClose();
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true); setDeleteError('');
    try {
      await organizationApi.deleteTrip(organization.id, toDelete.id);
      setToDelete(null);
      // Mesmo padrão de outras listas do painel: se era o único item da
      // página, volta uma página em vez de mostrar uma página vazia.
      await load(trips.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page);
    } catch (err) {
      // Fica no diálogo (não fecha): a mensagem do servidor explica por que
      // (reserva/interessado/visita/memória associada) sem perder o contexto.
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir a viagem.');
    } finally {
      setDeleting(false);
    }
  };

  // Mesma rede de segurança do formulário legado: fechar a aba ou recarregar
  // com algo não salvo avisa antes de perder o que foi digitado.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // beforeunload (acima) só cobre fechar a aba ou recarregar. O botão
  // Voltar/Avançar do navegador é navegação de histórico dentro do mesmo
  // SPA: não aciona beforeunload, e os links do próprio painel (menu
  // lateral, trocar empresa, sair) já ficam inacessíveis enquanto este
  // modal está aberto — o Radix aplica aria-hidden ao resto da página, e o
  // overlay cobre tudo visualmente —, então não há um segundo caminho de
  // navegação interna a proteger além deste. O popstate dispara depois que
  // o navegador já saiu da rota: a correção empurra a mesma rota de volta
  // (via navigate do próprio React Router, não history.pushState bruto,
  // para o router recompor a tela certa) e mostra a mesma confirmação de
  // descarte já usada ao cancelar; confirmar então deixa o Voltar seguir.
  useEffect(() => {
    const guardedPath = window.location.pathname + window.location.search;
    const onPopState = () => {
      if (!(editorOpen && dirty)) return;
      navigate(guardedPath, { replace: false });
      backTriggeredRef.current = true;
      setDiscardOpen(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [editorOpen, dirty, navigate]);
  const patch = (changes: Partial<TripForm>) => setForm((prev) => ({ ...prev, ...changes }));
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setPriceText(text);
    const num = parsePriceInput(text);
    patch({ priceValue: num, priceDisplay: syncPriceDisplay(form.priceValue, num, form.priceDisplay) });
  };
  const removeMedia = (index: number) => patch({ media: form.media.filter((_, i) => i !== index) });
  const updateMediaAlt = (index: number, alt: string) => patch({ media: form.media.map((item, i) => (i === index ? { ...item, alt } : item)) });

  // Isolado por empresa no servidor (organizationTripDocumentRoutes.ts);
  // aqui é só o cliente HTTP usado pelo componente compartilhado abaixo.
  const orgDocumentApi = useMemo(() => createOrganizationDocumentApi(organization.id), [organization.id]);
  const orgAiApi = useMemo(() => ({
    status: () => organizationApi.aiStatus(organization.id),
    tripDraft: (text: string) => organizationApi.aiTripDraft(organization.id, text),
  }), [organization.id]);
  const draftDefaults = creating && !templateSource ? { ...emptyForm, priceUnit: organization.defaultPriceUnit?.trim() || emptyForm.priceUnit } : {};
  const applyAiDraft = (draft: TripDraft, chosen: DraftKey[], overwrite: DraftKey[]) => {
    const next = applySuggestions(form as unknown as Record<string, unknown>, draft, chosen, overwrite, draftDefaults) as unknown as TripForm & { includedServices?: string[] };
    if (chosen.includes('startDateISO') && typeof draft.startDateISO === 'string' && draft.startDateISO) {
      next.startDateISO = mergeSuggestedDate(form.startDateISO, draft.startDateISO);
    }
    if (chosen.includes('endDateISO') && typeof draft.endDateISO === 'string' && draft.endDateISO) {
      next.endDateISO = mergeSuggestedDate(form.endDateISO || form.startDateISO, draft.endDateISO);
    }
    if (next.includedServices?.length) {
      next.includes = mergeUnique(next.includes, next.includedServices);
      delete next.includedServices;
    }
    // draft.spotsLeft é number (ver aiTripDraft.ts); o campo deste formulário
    // é sempre string (input controlado — ver save(), que chama .trim()).
    // Sem esta conversão, aplicar a sugestão quebra o salvamento a seguir.
    if (typeof (next as unknown as Record<string, unknown>).spotsLeft === 'number') {
      next.spotsLeft = String((next as unknown as Record<string, unknown>).spotsLeft);
    }
    if (next.priceValue !== form.priceValue) {
      next.priceDisplay = syncPriceDisplay(form.priceValue, next.priceValue, form.priceDisplay);
      setPriceText(formatPriceInput(next.priceValue));
    }
    setOptionsOpen(previous => { const filled = optionsFor(next); return { essential: previous.essential || filled.essential, departure: previous.departure || filled.departure, experience: previous.experience || filled.experience, trail: previous.trail || filled.trail }; });
    setForm(next);
  };

  const save = async () => {
    if (hasPendingItems) {
      setFormError('Adicione ou apague os itens que ainda estão sendo preenchidos antes de salvar.');
      return;
    }
    if (!form.title.trim() || !form.category.trim() || !form.city.trim() || !form.region.trim() || !form.description.trim() || !form.startDateISO) {
      setFormError('Preencha título, categoria, cidade, estado, descrição e data de saída.');
      return;
    }
    if (form.media.some((item) => !item.alt.trim())) {
      setFormError('Descreva todas as fotos antes de salvar.');
      return;
    }
    if (priceText.trim() && parsePriceInput(priceText) === null && !form.free) {
      setFormError('Não entendi o valor. Use números, como 109,99 ou 1.250,00.');
      return;
    }
    setSaving(true); setFormError('');
    try {
      const startDateISO = fromLocalDateTime(form.startDateISO, editing?.startDateISO);
      const endDateISO = form.endDateISO ? fromLocalDateTime(form.endDateISO, editing?.endDateISO) : null;
      if (!startDateISO || (form.endDateISO && !endDateISO)) { setFormError('Informe datas válidas.'); return; }
      const spotsLeft = form.spotsLeft.trim() ? Number(form.spotsLeft) : null;
      const data: OrgTripEssentials = {
        title: form.title.trim(), category: form.category.trim(), description: form.description.trim(),
        city: form.city.trim(), region: form.region.trim(), startDateISO, endDateISO,
        headlineDisplay: form.headlineDisplay.trim() || null, filterCategory: form.filterCategory.trim() || null,
        departureTime: form.departureTime.trim() || null, departureTolerance: form.departureTolerance.trim() || null,
        returnTime: form.returnTime.trim() || null, scheduleInfo: form.scheduleInfo.trim() || null, scheduleTBD: form.scheduleTBD,
        priceValue: form.priceValue, priceDisplay: form.priceDisplay.trim() || null, priceUnit: form.priceUnit.trim() || 'por pessoa', free: form.free,
        intensityClass: form.intensityClass, spotsLeft,
        trailDistance: form.trailDistance.trim() || null, supportPoint: form.supportPoint.trim() || null, supportPointInfo: form.supportPointInfo.trim() || null,
        meetingCity: form.meetingCity.trim() || null, meetingPoint: form.meetingPoint.trim() || null, meetingTBD: form.meetingTBD,
        meetingDetails: form.meetingDetails.trim() || null, meetingMapsQuery: form.meetingMapsQuery.trim() || null,
        includes: form.includes, includesHighlight: form.includesHighlight.trim() || null,
        itinerary: form.itinerary, routeNotes: form.routeNotes, importantInfo: form.importantInfo,
        // Nunca envia previewSrc: a rota só reconhece o caminho canônico
        // (ver organizationOwnedMedia.ts); previewSrc é só para exibição.
        media: form.media.map(stripPreview),
        departures: form.departures.map(({ time, place, city, mapsUrl, mapsQuery }) => ({ time, place, city, mapsUrl, mapsQuery })),
      };
      if (editing) {
        // Só envia o que realmente mudou: evita reescrever campos intocados
        // (e sobrescrever edição concorrente de quem não tocou o formulário).
        const changes: Partial<OrgTripEssentials> = {};
        const set = <K extends keyof OrgTripEssentials>(key: K, value: OrgTripEssentials[K], previous: unknown) => {
          if (JSON.stringify(value) !== JSON.stringify(previous)) changes[key] = value;
        };
        set('title', data.title, editing.title);
        set('category', data.category, editing.category);
        set('description', data.description, editing.description);
        set('city', data.city, editing.city);
        set('region', data.region, editing.region);
        set('startDateISO', data.startDateISO, editing.startDateISO);
        set('endDateISO', data.endDateISO, editing.endDateISO);
        set('headlineDisplay', data.headlineDisplay, editing.headlineDisplay);
        set('filterCategory', data.filterCategory, editing.filterCategory);
        set('departureTime', data.departureTime, editing.departureTime);
        set('departureTolerance', data.departureTolerance, editing.departureTolerance);
        set('returnTime', data.returnTime, editing.returnTime);
        set('scheduleInfo', data.scheduleInfo, editing.scheduleInfo);
        set('scheduleTBD', data.scheduleTBD, editing.scheduleTBD);
        set('priceValue', data.priceValue, editing.priceValue);
        set('priceDisplay', data.priceDisplay, editing.priceDisplay);
        set('priceUnit', data.priceUnit, editing.priceUnit);
        set('free', data.free, editing.free);
        set('intensityClass', data.intensityClass, editing.intensityClass);
        set('spotsLeft', data.spotsLeft, editing.spotsLeft);
        set('trailDistance', data.trailDistance, editing.trailDistance);
        set('supportPoint', data.supportPoint, editing.supportPoint);
        set('supportPointInfo', data.supportPointInfo, editing.supportPointInfo);
        set('meetingCity', data.meetingCity, editing.meetingCity);
        set('meetingPoint', data.meetingPoint, editing.meetingPoint);
        set('meetingTBD', data.meetingTBD, editing.meetingTBD);
        set('meetingDetails', data.meetingDetails, editing.meetingDetails);
        set('meetingMapsQuery', data.meetingMapsQuery, editing.meetingMapsQuery);
        set('includes', data.includes, editing.includes);
        set('includesHighlight', data.includesHighlight, editing.includesHighlight);
        set('itinerary', data.itinerary, editing.itinerary);
        set('routeNotes', data.routeNotes, editing.routeNotes);
        set('importantInfo', data.importantInfo, editing.importantInfo);
        set('media', data.media, editing.media.map(stripPreview));
        set('departures', data.departures, editing.departures.map(({ time, place, city, mapsUrl, mapsQuery }) => ({ time, place, city, mapsUrl, mapsQuery })));
        if (Object.keys(changes).length) await organizationApi.updateTrip(organization.id, editing.id, { ...changes, expectedUpdatedAt: editing.updatedAt });
      } else await organizationApi.createTrip(organization.id, data);
      setCreating(false); setEditing(null); setTemplateSource(null); setForm(emptyForm);
      await load(editing ? pagination.page : 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a viagem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Viagens"
        description={canManage ? 'Crie e edite rascunhos de viagens desta empresa.' : 'Consulta somente leitura das viagens desta empresa.'}
        actions={canManage ? <Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Nova viagem</Button> : undefined}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Período das viagens">
        {([{ value: 'upcoming', label: 'Próximas' }, { value: 'past', label: 'Anteriores' }, { value: 'all', label: 'Todas' }] as const).map(option => (
          <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)} className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${period === option.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-surface-300 bg-white text-surface-800 hover:border-primary-300'}`}>{option.label}</button>
        ))}
      </div>
      <FilterBar searchLabel="Buscar viagens" searchPlaceholder="Buscar por nome, cidade ou categoria" searchValue={search} onSearch={setSearch} onClear={() => { setSearch(''); setStatus(''); setPeriod('upcoming'); }} hasFilters={!!search || !!status || period !== 'upcoming'}>
        <select className="select w-full lg:w-52" value={status} onChange={event => setStatus(event.target.value)} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          {Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </FilterBar>
      {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
      {error ? null : loading ? (
        <p role="status" className="text-sm text-surface-600">Carregando viagens...</p>
      ) : !error && trips.length === 0 ? (
        <EmptyState
          icon={<Plane />}
          title="Nenhuma viagem cadastrada"
          text={canManage ? 'Crie a primeira viagem desta empresa.' : 'Esta empresa ainda não tem viagens registradas.'}
          action={canManage ? <Button variant="primary" onClick={openCreate}>Nova viagem</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {trips.map((trip) => (
            <article key={trip.id} className="card p-4 sm:p-5 flex flex-wrap gap-3 items-start justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold text-surface-900 break-words">{trip.title}</h2>
                <p className="text-sm text-surface-600">{trip.category} · {trip.city} - {trip.region}</p>
                <p className="text-sm text-surface-600">Saída: {new Date(trip.startDateISO).toLocaleDateString('pt-BR')}{trip.endDateISO ? ` · Retorno: ${new Date(trip.endDateISO).toLocaleDateString('pt-BR')}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={tripStatusTone(trip.status)}>{tripStatusLabel(trip.status)}</StatusBadge>
                {canManage && trip.status === 'DRAFT' && (
                  <Button small loading={loadingEdit === trip.id} icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => void openEdit(trip)} aria-label={`Editar ${trip.title}`}>
                    <span className="hidden sm:inline">Editar</span>
                  </Button>
                )}
                {canManage && (
                  // Qualquer situação (inclusive já publicada ou concluída):
                  // é o próprio motivo de existir deste recurso, reaproveitar
                  // uma viagem já rodada como base de um rascunho novo.
                  <Button small loading={loadingEdit === trip.id} icon={<CopyPlus className="w-4 h-4" aria-hidden="true" />} onClick={() => void openTemplate(trip)} aria-label={`Usar ${trip.title} como modelo`}>
                    <span className="hidden sm:inline">Usar como modelo</span>
                  </Button>
                )}
                {canManage && trip.status === 'DRAFT' && (
                  <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => { setDeleteError(''); setToDelete(trip); }} aria-label={`Excluir ${trip.title}`}>
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && <Pagination pagination={pagination} onChange={(page) => void load(page)} />}

      {canManage && (
        <Modal
          open={creating || !!editing}
          onOpenChange={(open) => { if (!open) closeForm(); }}
          title={templateSource ? 'Nova viagem a partir de modelo' : creating ? 'Nova viagem' : 'Editar viagem'}
          description="Rascunho visível só para esta empresa. Nunca é publicado automaticamente."
          widthClass="max-w-3xl"
          footer={
            <>
              <Button onClick={closeForm} disabled={saving}>Cancelar</Button>
              <Button variant="primary" loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</Button>
            </>
          }
        >
          <form id="org-trip-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="space-y-5">
            {templateSource && (
              <p className="alert-info" role="note">
                Dados de “{templateSource.title}” foram copiados para este rascunho novo. Data, horários, vagas e embarques ficaram em branco — revise os textos, preços e fotos, que ainda podem conter informações antigas. A viagem original não é alterada.
              </p>
            )}
            {formError && <div className="alert-error" role="alert">{formError}</div>}

            <section className="rounded-xl border border-surface-200 border-l-4 border-l-primary-600 p-4 space-y-4" aria-label="Preencher automaticamente">
              <h2 className="text-lg font-semibold text-surface-900">Preencher automaticamente</h2>
              <p className="text-sm text-surface-600">Cole um texto para receber sugestões. Após salvar o rascunho, você também pode usar um PDF. Revise tudo antes de salvar.</p>
              <AiDraftBlock api={orgAiApi} showUnavailable form={form as unknown as Record<string, unknown>} defaults={draftDefaults} onApply={applyAiDraft} />
            {editing && (
              <TripDocuments
                key={editing.id}
                tripId={editing.id}
                api={orgDocumentApi}
                form={form as unknown as Record<string, unknown>}
                defaults={{}}
                onApply={applyAiDraft}
                // Mesmo contrato do onAdd de ImageUploader: só preenche o
                // formulário (vira a próxima foto, ou a capa se for a
                // primeira) — nunca salva ou publica a viagem por conta
                // própria. alt chega já confirmado pela pessoa em
                // TripDocuments.tsx (o mesmo texto obrigatório do envio comum).
                onImportPhoto={(media, alt) => patch({ media: [...form.media, { src: media.src, alt, previewSrc: media.previewSrc }] })}
              />
            )}

            </section>

            <section className="rounded-xl border border-surface-200 border-l-4 border-l-primary-600 p-4 space-y-4" aria-label="Dados da viagem">
              <h2 className="text-lg font-semibold text-surface-900">Dados da viagem</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="org-trip-title" label="Título" required>
                <input id="org-trip-title" className="input" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
              </Field>
              <Field id="org-trip-category" label="Categoria" required>
                <input id="org-trip-category" className="input" value={form.category} onChange={(e) => patch({ category: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="org-trip-city" label="Cidade" required>
                <input id="org-trip-city" className="input" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
              </Field>
              <Field id="org-trip-region" label="Estado" required>
                <input id="org-trip-region" className="input" value={form.region} onChange={(e) => patch({ region: e.target.value })} />
              </Field>
            </div>
              <Field id="org-trip-intensity" label="Intensidade da atividade">
                <select id="org-trip-intensity" className="select" value={form.intensityClass} onChange={(e) => patch({ intensityClass: e.target.value as OrgTripIntensity })}>
                  {INTENSITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="org-trip-price" label="Valor (R$)" hint={form.free ? 'Viagem gratuita: sem valor.' : 'Ex.: 109,99 ou 1.250,00'}>
                    <input id="org-trip-price" type="text" inputMode="decimal" className="input" value={priceText} onChange={handlePriceChange} placeholder="109,99" disabled={form.free} autoComplete="off" />
                  </Field>
                  <Field id="org-trip-price-unit" label="Unidade do preço">
                    <input id="org-trip-price-unit" className="input" value={form.priceUnit} onChange={(e) => patch({ priceUnit: e.target.value })} disabled={form.free} />
                  </Field>
                </div>
                <label htmlFor="org-trip-free" className="checkbox-label min-h-[32px]">
                  <input id="org-trip-free" type="checkbox" className="checkbox-input" checked={form.free} onChange={(e) => patch({ free: e.target.checked })} />
                  <span className="text-sm text-surface-700">Viagem gratuita</span>
                </label>
                <Field id="org-trip-spots" label="Vagas restantes (opcional)">
                  <input id="org-trip-spots" type="number" min={0} className="input" value={form.spotsLeft} onChange={(e) => patch({ spotsLeft: e.target.value })} />
                </Field>
              <details className="rounded-lg border border-surface-200 p-3" open={optionsOpen.essential} onToggle={(event) => { const open = event.currentTarget.open; setOptionsOpen((previous) => previous.essential === open ? previous : { ...previous, essential: open }); }}>
                <summary className="cursor-pointer text-sm font-semibold text-surface-800">Mais opções</summary>
                <div className="mt-3 space-y-3">
              <Field id="org-trip-headline" label="Nome de exibição (opcional)" hint="Usado no lugar do título em destaques, se preenchido.">
                <input id="org-trip-headline" className="input" value={form.headlineDisplay} onChange={(e) => patch({ headlineDisplay: e.target.value })} />
              </Field>
                <Field id="org-trip-price-display" label="Preço como aparece no site (opcional)">
                  <input id="org-trip-price-display" className="input" value={form.priceDisplay} onChange={(e) => patch({ priceDisplay: e.target.value })} placeholder="Ex.: A partir de R$ 109,99" disabled={form.free} />
                </Field>
                <Field id="org-trip-filter-category" label="Filtro no site (opcional)" hint="Esta categoria aparece nos filtros do site. Se não escolher uma, a viagem ficará em Todas as categorias.">
                  <select id="org-trip-filter-category" className="select" value={form.filterCategory} onChange={(e) => patch({ filterCategory: e.target.value })}>
                    <option value="">Selecione uma categoria</option>
                    {form.filterCategory && !FILTER_CATEGORY_OPTIONS.some((option) => option.toLocaleLowerCase('pt-BR') === form.filterCategory.trim().toLocaleLowerCase('pt-BR')) && (
                      <option value={form.filterCategory}>{form.filterCategory} (personalizada)</option>
                    )}
                    {FILTER_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                </div>
              </details>
            </section>

            <section className="rounded-xl border border-surface-200 border-l-4 border-l-primary-600 p-4 space-y-4" aria-label="Embarque e horários">
              <h2 className="text-lg font-semibold text-surface-900">Embarque e horários</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="org-trip-start" label="Data de saída" required>
                <input id="org-trip-start" type="datetime-local" className="input" value={form.startDateISO} onChange={(e) => patch({ startDateISO: e.target.value })} />
              </Field>
              <Field id="org-trip-end" label="Data de retorno">
                <input id="org-trip-end" type="datetime-local" className="input" value={form.endDateISO} onChange={(e) => patch({ endDateISO: e.target.value })} />
              </Field>
            </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="org-trip-departure-time" label="Horário de saída (opcional)">
                    <input id="org-trip-departure-time" className="input" value={form.departureTime} onChange={(e) => patch({ departureTime: e.target.value })} placeholder="Ex.: 06h00" />
                  </Field>
                  <Field id="org-trip-return-time" label="Horário de retorno (opcional)">
                    <input id="org-trip-return-time" className="input" value={form.returnTime} onChange={(e) => patch({ returnTime: e.target.value })} placeholder="Ex.: 20h00" />
                  </Field>
                </div>
                <Field id="org-trip-departure-tolerance" label="Tolerância de atraso (opcional)">
                  <input id="org-trip-departure-tolerance" className="input" value={form.departureTolerance} onChange={(e) => patch({ departureTolerance: e.target.value })} placeholder="Ex.: 15 minutos" />
                </Field>
                <label htmlFor="org-trip-schedule-tbd" className="checkbox-label min-h-[32px]">
                  <input id="org-trip-schedule-tbd" type="checkbox" className="checkbox-input" checked={form.scheduleTBD} onChange={(e) => patch({ scheduleTBD: e.target.checked })} />
                  <span className="text-sm text-surface-700">Horário ainda não definido</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="org-trip-meeting-city" label="Município de embarque (opcional)">
                    <input id="org-trip-meeting-city" className="input" value={form.meetingCity} onChange={(e) => patch({ meetingCity: e.target.value })} />
                  </Field>
                  <Field id="org-trip-meeting-point" label="Local de embarque (opcional)">
                    <input id="org-trip-meeting-point" className="input" value={form.meetingPoint} onChange={(e) => patch({ meetingPoint: e.target.value })} />
                  </Field>
                </div>
                <label htmlFor="org-trip-meeting-tbd" className="checkbox-label min-h-[32px]">
                  <input id="org-trip-meeting-tbd" type="checkbox" className="checkbox-input" checked={form.meetingTBD} onChange={(e) => patch({ meetingTBD: e.target.checked })} />
                  <span className="text-sm text-surface-700">Embarque a confirmar</span>
                </label>
                <Field id="org-trip-meeting-details" label="Detalhes do embarque (opcional)">
                  <textarea id="org-trip-meeting-details" className="input" rows={2} value={form.meetingDetails} onChange={(e) => patch({ meetingDetails: e.target.value })} />
                </Field>
                <div className="form-group !mb-0">
                  <span className="label">Pontos de partida (opcional)</span>
                  <DeparturesInput value={form.departures} onPendingChange={(pending) => setPendingItem('embarque', pending)} onChange={(departures) => patch({ departures })} />
                </div>
              <details className="rounded-lg border border-surface-200 p-3" open={optionsOpen.departure} onToggle={(event) => { const open = event.currentTarget.open; setOptionsOpen((previous) => previous.departure === open ? previous : { ...previous, departure: open }); }}>
                <summary className="cursor-pointer text-sm font-semibold text-surface-800">Mais opções</summary>
                <div className="mt-3 space-y-3">
                <Field id="org-trip-schedule-info" label="Observação sobre o horário (opcional)">
                  <input id="org-trip-schedule-info" className="input" value={form.scheduleInfo} onChange={(e) => patch({ scheduleInfo: e.target.value })} />
                </Field>
                <Field id="org-trip-meeting-maps" label="Endereço para o Google Maps (opcional)">
                  <input id="org-trip-meeting-maps" className="input" value={form.meetingMapsQuery} onChange={(e) => patch({ meetingMapsQuery: e.target.value })} />
                </Field>
                </div>
              </details>
            </section>

            <section className="rounded-xl border border-surface-200 border-l-4 border-l-primary-600 p-4 space-y-4" aria-label="Como é a experiência">
              <h2 className="text-lg font-semibold text-surface-900">Como é a experiência</h2>
            <Field id="org-trip-description" label="Descrição" required>
              <textarea id="org-trip-description" className="input" rows={4} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
            </Field>

            <div className="form-group !mb-0">
              <span className="label">Fotos (opcional)</span>
              <p className="hint mb-2">A primeira foto é a capa. Visível só para esta empresa.</p>
              {form.media.length > 0 && (
                <ul className="space-y-2 mb-2">
                  {form.media.map((item, index) => (
                    <li key={`${item.src}-${index}`} className="flex items-start gap-2 p-2 bg-surface-50 rounded-lg border border-surface-200">
                      <img src={item.previewSrc ?? item.src} alt={item.alt} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        {index === 0 && <span className="badge badge-info mb-1 inline-block">Capa</span>}
                        <input className={`input ${item.alt.trim() ? '' : 'border-red-500'}`} value={item.alt} onChange={(e) => updateMediaAlt(index, e.target.value)} placeholder="O que aparece nesta foto? (obrigatório)" aria-label={`O que aparece na foto ${index + 1}? (obrigatório)`} />
                      </div>
                      <button type="button" className="btn-icon text-red-700 hover:bg-red-50 shrink-0" onClick={() => removeMedia(index)} aria-label={`Remover foto ${index + 1}`}><X className="w-4 h-4" aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              )}
              {form.media.length < 20 && (
                <ImageUploader idPrefix="org-trip-photo" endpoint={`/organizations/${encodeURIComponent(organization.id)}/tourism/media`} onPendingChange={(pending) => setPendingItem('foto', pending)} onAdd={(item) => patch({ media: [...form.media, { ...item, alt: item.alt || '' }] })} />
              )}
            </div>

                <div className="form-group !mb-0">
                  <span className="label">O que está incluso (opcional)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3" role="group" aria-label="Serviços padrão incluídos">
                    {INCLUDE_PRESETS.map((item) => (
                      <label key={item} className="checkbox-label min-h-[40px] rounded-lg border border-surface-200 px-3">
                        <input type="checkbox" className="checkbox-input" checked={hasItem(form.includes, item)} onChange={() => patch({ includes: togglePreset(form.includes, item) })} />
                        <span className="text-sm text-surface-800">{item}</span>
                      </label>
                    ))}
                  </div>
                  <ArrayInput
                    id="org-trip-includes"
                    value={customItems(form.includes)}
                    onPendingChange={(pending) => setPendingItem('inclui', pending)}
                    onChange={(items) => patch({ includes: mergeUnique(INCLUDE_PRESETS.filter((item) => hasItem(form.includes, item)), items) })}
                    placeholder="Ex.: Banho de rio, almoço"
                  />
                </div>
              <details className="rounded-lg border border-surface-200 p-3" open={optionsOpen.experience} onToggle={(event) => { const open = event.currentTarget.open; setOptionsOpen((previous) => previous.experience === open ? previous : { ...previous, experience: open }); }}>
                <summary className="cursor-pointer text-sm font-semibold text-surface-800">Mais opções</summary>
                <div className="mt-3 space-y-3">
                <Field id="org-trip-includes-highlight" label="Destaque do que está incluso (opcional)">
                  <input id="org-trip-includes-highlight" className="input" value={form.includesHighlight} onChange={(e) => patch({ includesHighlight: e.target.value })} />
                </Field>
                </div>
              </details>
            </section>

            <section className="rounded-xl border border-surface-200 border-l-4 border-l-primary-600 p-4 space-y-4" aria-label="Roteiro e orientações">
              <h2 className="text-lg font-semibold text-surface-900">Roteiro e orientações</h2>
                <div className="form-group !mb-0">
                  <span className="label">Itinerário (opcional)</span>
                  <ArrayInput id="org-trip-itinerary" value={form.itinerary} onPendingChange={(pending) => setPendingItem('roteiro', pending)} onChange={(itinerary) => patch({ itinerary })} placeholder="Ex.: 06h00 - Saída do ponto de encontro" />
                </div>
                <div className="form-group !mb-0">
                  <span className="label">Observações do roteiro (opcional)</span>
                  <ArrayInput id="org-trip-route-notes" value={form.routeNotes} onPendingChange={(pending) => setPendingItem('percurso', pending)} onChange={(routeNotes) => patch({ routeNotes })} placeholder="Ex.: Leve protetor solar" />
                </div>
                <div className="form-group !mb-0">
                  <span className="label">Informações importantes (opcional)</span>
                  <p className="hint mb-2">Marque apenas as orientações que valem para esta viagem. Você também pode adicionar uma informação própria.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3" role="group" aria-label="Orientações sugeridas">
                    {IMPORTANT_INFO_PRESETS.map((item) => (
                      <label key={item} className="checkbox-label min-h-[40px] rounded-lg border border-surface-200 px-3">
                        <input type="checkbox" className="checkbox-input" checked={hasImportantInfoPreset(form.importantInfo, item)} onChange={() => patch({ importantInfo: toggleImportantInfoPreset(form.importantInfo, item) })} />
                        <span className="text-sm text-surface-800">{item}</span>
                      </label>
                    ))}
                  </div>
                  <ArrayInput
                    id="org-trip-important-info"
                    value={customImportantInfo(form.importantInfo)}
                    onPendingChange={(pending) => setPendingItem('informações', pending)}
                    onChange={(items) => patch({ importantInfo: mergeUnique(IMPORTANT_INFO_PRESETS.filter((item) => hasImportantInfoPreset(form.importantInfo, item)), items) })}
                    placeholder="Ex.: Idade mínima de 12 anos"
                  />
                </div>
              <details className="rounded-lg border border-surface-200 p-3" open={optionsOpen.trail} onToggle={(event) => { const open = event.currentTarget.open; setOptionsOpen((previous) => previous.trail === open ? previous : { ...previous, trail: open }); }}>
                <summary className="cursor-pointer text-sm font-semibold text-surface-800">Mais opções</summary>
                <div className="mt-3 space-y-3">
                <Field id="org-trip-trail-distance" label="Distância da trilha (opcional)">
                  <input id="org-trip-trail-distance" className="input" value={form.trailDistance} onChange={(e) => patch({ trailDistance: e.target.value })} />
                </Field>
                <Field id="org-trip-support-point" label="Ponto de apoio (opcional)">
                  <input id="org-trip-support-point" className="input" value={form.supportPoint} onChange={(e) => patch({ supportPoint: e.target.value })} />
                </Field>
                <Field id="org-trip-support-point-info" label="Informações do ponto de apoio (opcional)">
                  <textarea id="org-trip-support-point-info" className="input" rows={2} value={form.supportPointInfo} onChange={(e) => patch({ supportPointInfo: e.target.value })} />
                </Field>
                </div>
              </details>
            </section>

            <section className="rounded-xl border border-surface-200 border-l-4 border-l-primary-600 p-4 space-y-4" aria-label="Revisão e salvamento">
              <h2 className="text-lg font-semibold text-surface-900">Revisão e salvamento</h2>
              <p className="text-sm text-surface-600">Confira a prévia antes de salvar. A viagem ficará visível apenas para esta empresa.</p>
            {/* Reaproveita os componentes de prévia do site (legado), nunca
                reimplementados: mesma lógica de card/proposta, sem salvar,
                publicar ou enviar nada por conta própria. */}
            <details className="card p-4">
              <summary className="cursor-pointer font-semibold text-surface-900">Ver prévia ilustrativa do card</summary>
              <div className="mt-4">
                <TripCardPreview illustrative trip={{ ...form, status: editing?.status ?? 'DRAFT', buttonLabel: 'Quero viajar', buttonClass: 'button-dark' }} />
              </div>
            </details>
            <TripProposalPreview trip={form} dirty={dirty} defaultOrganizer={organization.name} />
            </section>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={(open) => { setDiscardOpen(open); if (!open) backTriggeredRef.current = false; }}
        title="Descartar alterações?"
        description="Você mudou algo nesta viagem e ainda não salvou. Se descartar agora, essas mudanças se perdem."
        confirmLabel="Descartar alterações"
        onConfirm={discardAndClose}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => { if (!open && !deleting) { setToDelete(null); setDeleteError(''); } }}
        title="Excluir esta viagem?"
        description={deleteError || `“${toDelete?.title ?? ''}” será apagada de vez. Isso não pode ser desfeito.`}
        confirmLabel="Sim, excluir"
        busyLabel="Excluindo..."
        busy={deleting}
        onConfirm={remove}
      />
    </div>
  );
}
