import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { applySearchFilter } from '../utils/searchUtils.js';
import { MEDIA_FILE_PATTERN, mediaDirectory, mediaStorageKeyFromFilename, readMediaFileForServing } from '../services/mediaStorage.js';

const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership());

const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  isFeatured: z.enum(['true', 'false']).optional(),
}).strict();
const select = { id: true, title: true, date: true, dateDisplay: true, description: true, isFeatured: true, images: true } as const;
const ownGallery = (organizationId: string): Prisma.GalleryEntryWhereInput => ({
  AND: [
    { organizationId },
    { OR: [{ tripId: null }, { trip: { is: { organizationId } } }] },
    { OR: [{ visitId: null }, { visit: { is: { organizationId, OR: [{ tripId: null }, { trip: { is: { organizationId } } }] } } }] },
  ],
});

type Image = { filename: string; key: string; alt: string };
function parseKnownImages(value: string): Image[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    // A listagem mostra apenas a capa; isso limita a consulta a 100 chaves
    // por página e evita carregar uma coleção ilimitada de mídia por item.
    return parsed.slice(0, 1).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const { src, alt } = item as { src?: unknown; alt?: unknown };
      if (typeof src !== 'string' || !src.startsWith('/api/public/media/')) return [];
      const filename = src.slice('/api/public/media/'.length);
      if (!MEDIA_FILE_PATTERN.test(filename)) return [];
      return [{ filename, key: mediaStorageKeyFromFilename(filename), alt: typeof alt === 'string' ? alt.slice(0, 500) : '' }];
    });
  } catch { return []; }
}

router.get('/media/:file', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const filename = req.params.file;
  if (!MEDIA_FILE_PATTERN.test(filename)) throw AppError.notFound('Imagem não encontrada');
  const organizationId = req.organizationContext!.organization.id;
  const asset = await prisma.mediaAsset.findFirst({ where: { storageKey: mediaStorageKeyFromFilename(filename), organizationId, publishedAt: { not: null } }, select: { id: true } });
  if (!asset) throw AppError.notFound('Imagem não encontrada');
  try {
    const { buffer } = await readMediaFileForServing(await mediaDirectory(), filename);
    const contentTypes: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': contentTypes[filename.slice(filename.lastIndexOf('.') + 1)], 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }).send(buffer);
  } catch {
    throw AppError.notFound('Imagem não encontrada');
  }
}));

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const query = filters.parse(req.query);
  const organizationId = req.organizationContext!.organization.id;
  const clauses: Prisma.GalleryEntryWhereInput[] = [ownGallery(organizationId)];
  if (query.isFeatured) clauses.push({ isFeatured: query.isFeatured === 'true' });
  const matches = applySearchFilter(query.search, ['titleSearch', 'descriptionSearch']);
  if (matches) clauses.push({ OR: matches });
  const where: Prisma.GalleryEntryWhereInput = { AND: clauses };
  const result = await prisma.$transaction(async tx => {
    const [rows, total] = await Promise.all([
      tx.galleryEntry.findMany({ where, select, orderBy: [{ isFeatured: 'desc' }, { orderIndex: 'asc' }, { date: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      tx.galleryEntry.count({ where }),
    ]);
    const parsed = rows.map(row => parseKnownImages(row.images));
    const keys = [...new Set(parsed.flatMap(images => images.map(image => image.key)))];
    const owned = keys.length ? await tx.mediaAsset.findMany({ where: { storageKey: { in: keys }, organizationId, publishedAt: { not: null } }, select: { storageKey: true } }) : [];
    const ownedKeys = new Set(owned.map(asset => asset.storageKey));
    const data = rows.map(({ images: _images, ...row }, index) => ({
      ...row,
      images: parsed[index].filter(image => ownedKeys.has(image.key)).map(image => ({ src: `/api/organizations/${encodeURIComponent(organizationId)}/tourism/gallery/media/${image.filename}`, alt: image.alt })),
    }));
    return { data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  });
  res.json(result);
}));

export default router;
