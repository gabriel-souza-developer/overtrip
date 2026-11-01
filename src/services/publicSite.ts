import { prisma } from '../lib/prisma.js';
import { toSiteDate } from './publicTrips.js';

// Galeria e mapa do site público. Mesmo padrão de publicTrips: lista explícita
// de campos (sem id, sem vínculos, sem dados de usuário), só leitura.

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "18 de outubro de 2026", a partir da data do site (AAAA-MM-DD...), sem deslocar o dia. */
export function longDatePt(date: Date): string {
  const [y, m, d] = toSiteDate(date).slice(0, 10).split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

function parseImages(value: string | null | undefined): { src: string; alt: string }[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => i && typeof i.src === 'string' && i.src.trim() !== '')
      .map((i) => ({ src: i.src as string, alt: typeof i.alt === 'string' ? i.alt : '' }));
  } catch {
    return [];
  }
}

interface GalleryRow {
  title: string;
  date: Date;
  dateDisplay: string;
  description: string;
  images: string;
  isFeatured: boolean;
  orderIndex: number;
}

/** Formato que js/render.js consome, mais `featured`. */
export function mapPublicGalleryEntry(row: GalleryRow) {
  return {
    title: row.title,
    date: row.dateDisplay || longDatePt(row.date),
    dateISO: toSiteDate(row.date).slice(0, 10),
    description: row.description,
    images: parseImages(row.images),
    featured: row.isFeatured,
  };
}

/** Destaque primeiro; as demais por data decrescente. */
export function sortPublicGallery<T extends { featured: boolean; dateISO: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return b.dateISO.localeCompare(a.dateISO);
  });
}

interface VisitRow {
  title: string;
  city: string;
  region: string;
  date: Date | null;
  lat: number | null;
  lng: number | null;
}

/** Formato de VISITED_PLACES em js/map.js. */
export function mapPublicDestination(row: VisitRow & { lat: number; lng: number }) {
  return {
    title: row.title,
    place: `${row.city} - ${row.region}`,
    ...(row.date ? { date: longDatePt(row.date) } : {}),
    lat: row.lat,
    lng: row.lng,
  };
}

export const publicSiteService = {
  async gallery() {
    const rows = await prisma.galleryEntry.findMany({
      select: { title: true, date: true, dateDisplay: true, description: true, images: true, isFeatured: true, orderIndex: true },
    });
    const entries = rows.map(mapPublicGalleryEntry).filter((e) => e.images.length > 0);
    // Só um destaque por vez: se houver mais de um, vale o primeiro por data.
    const sorted = sortPublicGallery(entries);
    return sorted.map((e, i) => ({ ...e, featured: e.featured && i === 0 }));
  },

  async destinations() {
    const rows = await prisma.visit.findMany({
      where: { needsReview: false, lat: { not: null }, lng: { not: null } },
      select: { title: true, city: true, region: true, date: true, lat: true, lng: true },
      orderBy: [{ date: 'desc' }, { title: 'asc' }],
    });
    return rows
      .filter((r): r is VisitRow & { lat: number; lng: number } => r.lat !== null && r.lng !== null)
      .map(mapPublicDestination);
  },
};
