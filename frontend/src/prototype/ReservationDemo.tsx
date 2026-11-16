import React, { useState } from 'react';

export interface DemoReservation {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  people: number;
  detail: string;
}

/** Registro exclusivamente em memória para experimentar o fluxo. */
export default function ReservationDemo({ niche, initial, reservations, onSave, onCancel }: {
  niche: 'pousada' | 'restaurante';
  initial?: DemoReservation;
  reservations: DemoReservation[];
  onSave: (value: DemoReservation) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [people, setPeople] = useState(initial?.people ?? 1);
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [error, setError] = useState('');
  const isLodging = niche === 'pousada';

  return <section className="demo-card demo-reservation-form" aria-labelledby="demo-reservation-title">
    <h2 id="demo-reservation-title">{initial ? 'Editar reserva de exemplo' : 'Nova reserva de exemplo'}</h2>
    <p>Os dados ficam apenas nesta tela e são apagados ao recarregar a página.</p>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim() || !date || !detail.trim() || !Number.isInteger(people) || people < 1 || people > 99) return;
      if (isLodging && (!endDate || endDate <= date)) {
        setError('A saída deve acontecer depois da chegada.');
        return;
      }
      if (isLodging && reservations.some(reservation => reservation.id !== initial?.id && reservation.endDate && reservation.detail.trim().toLocaleLowerCase('pt-BR') === detail.trim().toLocaleLowerCase('pt-BR') && date < reservation.endDate && reservation.date < endDate)) {
        setError('Esta acomodação já possui uma reserva de exemplo nesse período.');
        return;
      }
      setError('');
      onSave({ id: initial?.id ?? `${Date.now()}-${Math.random()}`, name: name.trim(), date, ...(isLodging ? { endDate } : {}), people, detail: detail.trim() });
    }}>
      <label>Nome do {isLodging ? 'hóspede' : 'cliente'}<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>{isLodging ? 'Data de chegada' : 'Data'}<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      {isLodging && <label>Data de saída<input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>}
      <label>{isLodging ? 'Hóspedes' : 'Pessoas'}<input required type="number" min="1" max="99" value={people} onChange={e => setPeople(Number(e.target.value))} /></label>
      <label>{isLodging ? 'Acomodação' : 'Horário'}<input required maxLength={100} type={isLodging ? 'text' : 'time'} value={detail} onChange={e => setDetail(e.target.value)} /></label>
      {isLodging && <p className="demo-form-hint">Conflitos são verificados apenas entre reservas adicionadas nesta sessão; os exemplos ilustrativos não representam disponibilidade real.</p>}
      {error && <p className="demo-form-error" role="alert">{error}</p>}
      <div className="demo-form-actions"><button type="submit" className="demo-primary">{initial ? 'Salvar alterações' : 'Adicionar exemplo'}</button><button type="button" className="demo-text-link" onClick={onCancel}>Cancelar</button></div>
    </form>
  </section>;
}
