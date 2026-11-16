import { describe, expect, it } from 'vitest';
import { lodgingMovement } from '../frontend/src/lib/lodgingMovement';

describe('movimento diário da pousada', () => {
  it('conta apenas chegadas e saídas ainda pendentes no dia informado', () => {
    const day = '2030-06-10';
    const stays = [
      { status: 'CONFIRMED', checkIn: day, checkOut: '2030-06-12' },
      { status: 'CHECKED_IN', checkIn: '2030-06-08', checkOut: day },
      { status: 'CHECKED_IN', checkIn: day, checkOut: '2030-06-11' },
      { status: 'CHECKED_OUT', checkIn: '2030-06-08', checkOut: day },
      { status: 'CANCELLED', checkIn: day, checkOut: '2030-06-12' },
      { status: 'CONFIRMED', checkIn: '2030-06-11', checkOut: '2030-06-12' },
      { status: 'CONFIRMED', checkIn: '2030-06-09', checkOut: '2030-06-12' },
      { status: 'CHECKED_IN', checkIn: '2030-06-07', checkOut: '2030-06-09' },
    ];
    expect(lodgingMovement(stays, day)).toEqual({ arrivals: 1, departures: 1, overdueArrivals: 1, overdueDepartures: 1 });
  });
});
