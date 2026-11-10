import React, { useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import type { TripFormData } from '../api';
import { useToast } from '../hooks/useToast';
import { buildTripProposal, tripProposalText } from '../lib/tripProposal';
import { brandUrl } from '../lib/basePath';
import Button from './Button';
import Field from './Field';
import Modal from './Modal';

/** Prévia local, sem persistência, publicação ou compartilhamento automático. */
export default function TripProposalPreview({ trip, dirty }: { trip: TripFormData; dirty: boolean }) {
  const [open, setOpen] = useState(false);
  const [organizer, setOrganizer] = useState('OVERTRIP');
  const { toast } = useToast();
  const proposal = buildTripProposal(trip, organizer);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard indisponível');
      await navigator.clipboard.writeText(tripProposalText(proposal));
      toast.success('Proposta copiada. Revise antes de compartilhar.');
    } catch {
      toast.error('Não foi possível copiar. Verifique a permissão da área de transferência no navegador.');
    }
  };
  return <>
    <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold text-surface-900">Proposta da viagem</h2><p className="text-sm text-surface-600">Confira uma apresentação com os dados da viagem.</p></div>
      <Button icon={<FileText className="h-4 w-4" aria-hidden="true" />} onClick={() => setOpen(true)}>Prévia da proposta</Button>
    </div>
    <Modal open={open} onOpenChange={setOpen} title="Prévia da proposta" description="Esta prévia não publica nem envia dados. Revise o conteúdo antes de compartilhar." widthClass="max-w-2xl" footer={<><Button onClick={() => setOpen(false)}>Fechar</Button><Button variant="primary" icon={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={copy}>Copiar texto</Button></>}>
      <div className="space-y-4">
        {dirty && <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3" role="status">A prévia inclui alterações ainda não salvas.</p>}
        <Field id="proposal-organizer" label="Nome do organizador" hint="Usado somente nesta prévia; não altera as configurações."><input id="proposal-organizer" className="input" maxLength={120} value={organizer} onChange={e => setOrganizer(e.target.value)} /></Field>
        <article className="rounded-xl border border-surface-200 overflow-hidden bg-white">
          <header className="bg-surface-900 text-white px-5 py-4 flex items-center gap-3">{proposal.organizer.toUpperCase() === 'OVERTRIP' && <img src={brandUrl('overtrip-logo-com-fundo-laranja-192.png')} alt="" className="h-10 w-10 rounded-lg" />}<div><p className="text-xs text-surface-300 uppercase tracking-wide">Proposta de viagem</p><p className="font-semibold">{proposal.organizer}</p></div></header>
          <div className="p-5 space-y-4"><h3 className="text-xl font-semibold text-surface-900">{proposal.title}</h3>{proposal.description && <p className="text-sm text-surface-700 whitespace-pre-wrap">{proposal.description}</p>}
            <dl className="grid sm:grid-cols-2 gap-3 text-sm"><div><dt className="text-surface-500">Destino</dt><dd>{proposal.destination || 'Não informado'}</dd></div><div><dt className="text-surface-500">Data</dt><dd>{proposal.date || 'Não informada'}</dd></div><div><dt className="text-surface-500">Horário</dt><dd>{proposal.schedule || 'Não informado'}</dd></div><div><dt className="text-surface-500">Valor</dt><dd>{proposal.price || 'Não informado'}</dd></div></dl>
            {proposal.departures.length > 0 && <section><h4 className="font-semibold text-sm">Embarques</h4><ul className="text-sm text-surface-700 mt-1 space-y-1">{proposal.departures.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
            {proposal.includes.length > 0 && <section><h4 className="font-semibold text-sm">Inclui</h4><ul className="text-sm text-surface-700 mt-1 list-disc pl-5">{proposal.includes.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
            {proposal.itinerary.length > 0 && <section><h4 className="font-semibold text-sm">Roteiro</h4><ul className="text-sm text-surface-700 mt-1 list-disc pl-5">{proposal.itinerary.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
          </div>
        </article>
      </div>
    </Modal>
  </>;
}
