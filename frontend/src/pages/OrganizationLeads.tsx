import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Plus, ShieldAlert, UsersRound } from 'lucide-react';
import { organizationApi, type OrgLead, type OrgLeadEssentials, type OrgLeadStage } from '../api/organizations';
import { formatDateBR } from '../lib/dateInput';
import type { OrganizationOutletContext } from './OrganizationLayout';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Field from '../components/Field';

const STAGE_LABELS: Record<OrgLeadStage, string> = { NEW: 'Novo', CONTACTED: 'Contato realizado', NEGOTIATING: 'Em negociação', WON: 'Convertido', LOST: 'Encerrado' };
const STAGE_OPTIONS = Object.keys(STAGE_LABELS) as OrgLeadStage[];

interface LeadForm { name: string; phone: string; email: string; stage: OrgLeadStage; notes: string }
const emptyForm: LeadForm = { name: '', phone: '', email: '', stage: 'NEW', notes: '' };

export default function OrganizationLeads() {
  const { organization, role } = useOutletContext<OrganizationOutletContext>();
  const allowed = role === 'OWNER' || role === 'ADMIN';
  const [leads, setLeads] = useState<OrgLead[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<OrgLead | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async (page = 1) => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const data = await organizationApi.leads(organization.id, { page, limit: 20 });
      setLeads(data.data); setPagination(data.pagination);
    } catch (err) {
      setLeads([]);
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os interessados.');
    } finally { setLoading(false); }
  }, [organization.id, allowed]);
  useEffect(() => { void load(1); }, [load]);

  const openCreate = () => { setEditing(null); setCreating(true); setForm(emptyForm); setFormError(''); };
  const openEdit = (lead: OrgLead) => {
    setCreating(false); setEditing(lead); setFormError('');
    setForm({ name: lead.name, phone: lead.phone ?? '', email: lead.email ?? '', stage: lead.stage, notes: lead.notes ?? '' });
  };
  const closeForm = () => { if (saving) return; setCreating(false); setEditing(null); setForm(emptyForm); };
  const patch = (changes: Partial<LeadForm>) => setForm((prev) => ({ ...prev, ...changes }));

  const save = async () => {
    if (!form.name.trim()) { setFormError('Informe o nome do interessado.'); return; }
    if (creating && !form.phone.trim() && !form.email.trim()) { setFormError('Informe telefone ou e-mail para contato.'); return; }
    setSaving(true); setFormError('');
    try {
      const data: OrgLeadEssentials = { name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, stage: form.stage, notes: form.notes.trim() || null };
      if (editing) {
        const changes: Partial<OrgLeadEssentials> = {};
        if (data.name !== editing.name) changes.name = data.name;
        if (data.phone !== (editing.phone || null)) changes.phone = data.phone;
        if (data.email !== (editing.email || null)) changes.email = data.email;
        if (data.stage !== editing.stage) changes.stage = data.stage;
        if (form.notes !== (editing.notes ?? '')) changes.notes = data.notes;
        if (Object.keys(changes).length) await organizationApi.updateLead(organization.id, editing.id, { ...changes, expectedUpdatedAt: editing.updatedAt });
      } else await organizationApi.createLead(organization.id, data);
      setCreating(false); setEditing(null); setForm(emptyForm);
      await load(editing ? pagination.page : 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o interessado.');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Interessados" />
        <EmptyState icon={<ShieldAlert />} title="Acesso restrito" text="Somente proprietários e administradores desta empresa podem consultar os interessados." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interessados"
        description="Cadastre e edite os interessados desta empresa."
        actions={<Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Novo interessado</Button>}
      />
      {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
      {error ? null : loading ? (
        <p role="status" className="text-sm text-surface-600">Carregando interessados...</p>
      ) : !error && leads.length === 0 ? (
        <EmptyState icon={<UsersRound />} title="Nenhum interessado encontrado" text="Cadastre o primeiro interessado desta empresa." action={<Button variant="primary" onClick={openCreate}>Novo interessado</Button>} />
      ) : (
        <div className="grid gap-3">
          {leads.map((lead) => (
            <article key={lead.id} className="card p-4 sm:p-5 flex flex-wrap gap-3 items-start justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold text-surface-900 break-words">{lead.name}</h2>
                <p className="text-sm text-surface-600">{STAGE_LABELS[lead.stage]}{lead.responsible ? ` · Responsável: ${lead.responsible}` : ''}</p>
                <p className="text-sm text-surface-600">{lead.phone || 'Telefone não informado'}{lead.email ? ` · ${lead.email}` : ''}</p>
                {lead.nextFollowUpAt && <p className="text-sm text-surface-600">Próximo contato: {formatDateBR(lead.nextFollowUpAt)}</p>}
              </div>
              <Button small icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => openEdit(lead)} aria-label={`Editar ${lead.name}`}>
                <span className="hidden sm:inline">Editar</span>
              </Button>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && <Pagination pagination={pagination} onChange={(page) => void load(page)} />}

      <Modal
        open={creating || !!editing}
        onOpenChange={(open) => { if (!open) closeForm(); }}
        title={creating ? 'Novo interessado' : 'Editar interessado'}
        description="Dados de contato visíveis só para OWNER/ADMIN desta empresa."
        widthClass="max-w-2xl"
        footer={
          <>
            <Button onClick={closeForm} disabled={saving}>Cancelar</Button>
            <Button variant="primary" loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</Button>
          </>
        }
      >
        <form id="org-lead-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="space-y-4">
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field id="org-lead-name" label="Nome" required>
            <input id="org-lead-name" className="input" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="org-lead-phone" label="Telefone" required={creating && !form.email.trim()}>
              <input id="org-lead-phone" className="input" value={form.phone} onChange={(e) => patch({ phone: e.target.value })} />
            </Field>
            <Field id="org-lead-email" label="E-mail" required={creating && !form.phone.trim()}>
              <input id="org-lead-email" type="email" className="input" value={form.email} onChange={(e) => patch({ email: e.target.value })} />
            </Field>
          </div>
          <Field id="org-lead-stage" label="Etapa">
            <select id="org-lead-stage" className="select" value={form.stage} onChange={(e) => patch({ stage: e.target.value as OrgLeadStage })}>
              {STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </select>
          </Field>
          <Field id="org-lead-notes" label="Anotações">
            <textarea id="org-lead-notes" className="input" rows={3} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
