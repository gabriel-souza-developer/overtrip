type Stay = { status: string; checkIn: string; checkOut: string };

/** Apenas operações pendentes para o dia civil da pousada. */
export function lodgingMovement(stays: Stay[], today: string) {
  return {
    arrivals: stays.filter(stay => stay.status === 'CONFIRMED' && stay.checkIn === today).length,
    departures: stays.filter(stay => stay.status === 'CHECKED_IN' && stay.checkOut === today).length,
    overdueArrivals: stays.filter(stay => stay.status === 'CONFIRMED' && stay.checkIn < today).length,
    overdueDepartures: stays.filter(stay => stay.status === 'CHECKED_IN' && stay.checkOut < today).length,
  };
}
