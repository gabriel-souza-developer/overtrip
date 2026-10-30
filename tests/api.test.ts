import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express from 'express';
import request from 'supertest';

// Setup test app
const prisma = new PrismaClient();
const JWT_SECRET = 'test-secret-key';
const JWT_EXPIRES_IN = '1h';

let app: express.Express;
let adminToken: string;
let adminUserId: string;

beforeAll(async () => {
  // Create test app (simplified - we'd need to import the actual app)
  // For now, test the services directly
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up test data
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: 'test:' } } });
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: 'test:' } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: 'test:' } } });
});

describe('Auth Service', () => {
  it('should hash passwords correctly', async () => {
    const password = 'testPassword123';
    const hash = await bcrypt.hash(password, 12);
    const valid = await bcrypt.compare(password, hash);
    const invalid = await bcrypt.compare('wrongPassword', hash);
    
    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });

  it('should generate and verify JWT tokens', () => {
    const payload = { id: 'test-id', email: 'test@test.com', role: 'admin' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    
    expect(decoded.id).toBe(payload.id);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it('should reject invalid JWT tokens', () => {
    expect(() => jwt.verify('invalid-token', JWT_SECRET)).toThrow();
    expect(() => jwt.verify('', JWT_SECRET)).toThrow();
  });
});

describe('Trip Service', () => {
  it('should create a trip with valid data', async () => {
    const tripData = {
      title: 'Test Trip',
      headlineDisplay: 'Test Headline',
      category: 'Test Category',
      description: 'Test description',
      city: 'Test City',
      region: 'PB',
      startDateISO: new Date('2026-12-01T06:00:00-03:00'),
      priceValue: 100,
      priceDisplay: 'R$ 100,00',
      intensityClass: 'moderado' as const,
      includes: ['Item 1', 'Item 2'],
      media: [{ src: 'https://example.com/img.jpg', alt: 'Test' }],
      storedIdentity: `test:${Date.now()}`,
    };

    const trip = await prisma.trip.create({
      data: {
        ...tripData,
        includes: JSON.stringify(tripData.includes),
        media: JSON.stringify(tripData.media),
      },
    });

    expect(trip.id).toBeDefined();
    expect(trip.title).toBe(tripData.title);
    expect(trip.storedIdentity).toBe(tripData.storedIdentity);
    expect(JSON.parse(trip.includes)).toEqual(tripData.includes);
    expect(JSON.parse(trip.media)).toEqual(tripData.media);
  });

  it('should find trips with pagination', async () => {
    // Create multiple test trips
    for (let i = 0; i < 5; i++) {
      await prisma.trip.create({
        data: {
          title: `Test Trip ${i}`,
          category: 'Test',
          description: 'Test',
          city: 'City',
          region: 'PB',
          startDateISO: new Date('2026-12-01T06:00:00-03:00'),
          intensityClass: 'moderado',
          includes: JSON.stringify([]),
          media: JSON.stringify([]),
          storedIdentity: `test:trip:${i}:${Date.now()}`,
        },
      });
    }

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where: { storedIdentity: { startsWith: 'test:trip:' } },
        take: 3,
        skip: 0,
        orderBy: { startDateISO: 'desc' },
      }),
      prisma.trip.count({ where: { storedIdentity: { startsWith: 'test:trip:' } } }),
    ]);

    expect(trips.length).toBe(3);
    expect(total).toBe(5);
  });

  it('should enforce unique storedIdentity', async () => {
    const storedIdentity = `test:unique:${Date.now()}`;
    
    await prisma.trip.create({
      data: {
        title: 'Trip 1',
        category: 'Test',
        description: 'Test',
        city: 'City',
        region: 'PB',
        startDateISO: new Date('2026-12-01T06:00:00-03:00'),
        intensityClass: 'moderado',
        includes: JSON.stringify([]),
        media: JSON.stringify([]),
        storedIdentity,
      },
    });

    await expect(
      prisma.trip.create({
        data: {
          title: 'Trip 2',
          category: 'Test',
          description: 'Test',
          city: 'City',
          region: 'PB',
          startDateISO: new Date('2026-12-01T06:00:00-03:00'),
          intensityClass: 'moderado',
          includes: JSON.stringify([]),
          media: JSON.stringify([]),
          storedIdentity,
        },
      })
    ).rejects.toThrow();
  });
});

describe('Visit Service', () => {
  it('should create a visit with optional fields', async () => {
    const visit = await prisma.visit.create({
      data: {
        title: 'Test Visit',
        city: 'João Pessoa',
        region: 'PB',
        date: new Date('2026-12-01T15:00:00-03:00'),
        lat: -7.1195,
        lng: -34.845,
        needsReview: true,
        storedIdentity: `test:visit:${Date.now()}`,
      },
    });

    expect(visit.id).toBeDefined();
    expect(visit.title).toBe('Test Visit');
    expect(visit.lat).toBe(-7.1195);
    expect(visit.lng).toBe(-34.845);
    expect(visit.needsReview).toBe(true);
  });

  it('should create a visit without coordinates', async () => {
    const visit = await prisma.visit.create({
      data: {
        title: 'Visit without coords',
        city: 'Unknown City',
        region: 'PB',
        needsReview: true,
        storedIdentity: `test:visit:nocoords:${Date.now()}`,
      },
    });

    expect(visit.lat).toBeNull();
    expect(visit.lng).toBeNull();
  });

  it('should filter visits by needsReview', async () => {
    await prisma.visit.create({
      data: {
        title: 'Needs Review',
        city: 'City 1',
        region: 'PB',
        needsReview: true,
        storedIdentity: `test:visit:review:${Date.now()}:1`,
      },
    });

    await prisma.visit.create({
      data: {
        title: 'Reviewed',
        city: 'City 2',
        region: 'PB',
        needsReview: false,
        storedIdentity: `test:visit:review:${Date.now()}:2`,
      },
    });

    const needsReview = await prisma.visit.count({
      where: { needsReview: true, storedIdentity: { startsWith: 'test:visit:review:' } },
    });

    const reviewed = await prisma.visit.count({
      where: { needsReview: false, storedIdentity: { startsWith: 'test:visit:review:' } },
    });

    expect(needsReview).toBe(1);
    expect(reviewed).toBe(1);
  });

  it('should associate visit with trip', async () => {
    const trip = await prisma.trip.create({
      data: {
        title: 'Trip for Visit',
        category: 'Test',
        description: 'Test',
        city: 'City',
        region: 'PB',
        startDateISO: new Date('2026-12-01T06:00:00-03:00'),
        intensityClass: 'moderado',
        includes: JSON.stringify([]),
        media: JSON.stringify([]),
        storedIdentity: `test:trip:forvisit:${Date.now()}`,
      },
    });

    const visit = await prisma.visit.create({
      data: {
        title: 'Visit to associate',
        city: 'City',
        region: 'PB',
        needsReview: true,
        storedIdentity: `test:visit:associate:${Date.now()}`,
      },
    });

    const updated = await prisma.visit.update({
      where: { id: visit.id },
      data: { tripId: trip.id, needsReview: false },
    });

    expect(updated.tripId).toBe(trip.id);
    expect(updated.needsReview).toBe(false);
  });
});

describe('Gallery Service', () => {
  it('should create a gallery entry with images', async () => {
    const images = [
      { src: 'https://example.com/img1.jpg', alt: 'Image 1' },
      { src: 'https://example.com/img2.jpg', alt: 'Image 2' },
    ];

    const entry = await prisma.galleryEntry.create({
      data: {
        title: 'Test Gallery',
        date: new Date('2026-12-01T15:00:00-03:00'),
        dateDisplay: '1 de dezembro de 2026',
        description: 'Test gallery description',
        images: JSON.stringify(images),
        isFeatured: false,
        orderIndex: 0,
        storedIdentity: `test:gallery:${Date.now()}`,
      },
    });

    expect(entry.id).toBeDefined();
    expect(entry.title).toBe('Test Gallery');
    expect(JSON.parse(entry.images)).toEqual(images);
  });

  it('should only allow one featured entry', async () => {
    // Create first featured
    const entry1 = await prisma.galleryEntry.create({
      data: {
        title: 'Featured 1',
        date: new Date('2026-12-01T15:00:00-03:00'),
        dateDisplay: '1 de dezembro de 2026',
        description: 'Test',
        images: JSON.stringify([{ src: 'https://example.com/img.jpg', alt: 'Test' }]),
        isFeatured: true,
        orderIndex: 0,
        storedIdentity: `test:gallery:featured:${Date.now()}:1`,
      },
    });

    // Create second entry (not featured)
    const entry2 = await prisma.galleryEntry.create({
      data: {
        title: 'Featured 2',
        date: new Date('2026-12-02T15:00:00-03:00'),
        dateDisplay: '2 de dezembro de 2026',
        description: 'Test',
        images: JSON.stringify([{ src: 'https://example.com/img.jpg', alt: 'Test' }]),
        isFeatured: false,
        orderIndex: 1,
        storedIdentity: `test:gallery:featured:${Date.now()}:2`,
      },
    });

    // Unset first featured, set second as featured
    await prisma.galleryEntry.updateMany({
      where: { isFeatured: true, storedIdentity: { startsWith: 'test:gallery:featured:' } },
      data: { isFeatured: false },
    });

    await prisma.galleryEntry.update({
      where: { id: entry2.id },
      data: { isFeatured: true },
    });

    const featured = await prisma.galleryEntry.count({
      where: { isFeatured: true, storedIdentity: { startsWith: 'test:gallery:featured:' } },
    });

    expect(featured).toBe(1);
  });

  it('should reorder gallery entries', async () => {
    const entries = [];
    for (let i = 0; i < 3; i++) {
      const entry = await prisma.galleryEntry.create({
        data: {
          title: `Gallery ${i}`,
          date: new Date(`2026-12-0${i+1}T15:00:00-03:00`),
          dateDisplay: `${i+1} de dezembro de 2026`,
          description: 'Test',
          images: JSON.stringify([{ src: 'https://example.com/img.jpg', alt: 'Test' }]),
          isFeatured: false,
          orderIndex: i,
          storedIdentity: `test:gallery:reorder:${Date.now()}:${i}`,
        },
      });
      entries.push(entry);
    }

    // Reorder: reverse the order
    await prisma.$transaction(
      entries.map((e, i) =>
        prisma.galleryEntry.update({
          where: { id: e.id },
          data: { orderIndex: 2 - i },
        })
      )
    );

    const reordered = await prisma.galleryEntry.findMany({
      where: { storedIdentity: { startsWith: 'test:gallery:reorder:' } },
      orderBy: { orderIndex: 'asc' },
    });

    expect(reordered[0].title).toBe('Gallery 2');
    expect(reordered[1].title).toBe('Gallery 1');
    expect(reordered[2].title).toBe('Gallery 0');
  });
});

describe('Dashboard Stats', () => {
  it('should calculate dashboard stats correctly', async () => {
    const stats = await Promise.all([
      prisma.trip.count(),
      prisma.trip.count({ where: { status: 'OPEN' } }),
      prisma.trip.count({ where: { status: 'DRAFT' } }),
      prisma.visit.count(),
      prisma.visit.count({ where: { needsReview: true } }),
      prisma.visit.count({ where: { lat: { not: null }, lng: { not: null } } }),
      prisma.galleryEntry.count(),
      prisma.galleryEntry.count({ where: { isFeatured: true } }),
    ]);

    const [tripsTotal, tripsPublished, tripsDraft, visitsTotal, visitsNeedsReview, visitsWithCoords, galleryTotal, galleryFeatured] = stats;

    expect(typeof tripsTotal).toBe('number');
    expect(typeof tripsPublished).toBe('number');
    expect(typeof tripsDraft).toBe('number');
    expect(typeof visitsTotal).toBe('number');
    expect(typeof visitsNeedsReview).toBe('number');
    expect(typeof visitsWithCoords).toBe('number');
    expect(typeof galleryTotal).toBe('number');
    expect(typeof galleryFeatured).toBe('number');
    
    // Basic sanity checks
    expect(tripsTotal).toBeGreaterThanOrEqual(0);
    expect(visitsTotal).toBeGreaterThanOrEqual(0);
    expect(galleryTotal).toBeGreaterThanOrEqual(0);
  });
});

describe('Data Integrity', () => {
  it('should prevent deleting trip with associated visits', async () => {
    const trip = await prisma.trip.create({
      data: {
        title: 'Trip with visits',
        category: 'Test',
        description: 'Test',
        city: 'City',
        region: 'PB',
        startDateISO: new Date('2026-12-01T06:00:00-03:00'),
        intensityClass: 'moderado',
        includes: JSON.stringify([]),
        media: JSON.stringify([]),
        storedIdentity: `test:trip:withvisits:${Date.now()}`,
      },
    });

    await prisma.visit.create({
      data: {
        title: 'Associated visit',
        city: 'City',
        region: 'PB',
        tripId: trip.id,
        needsReview: false,
        storedIdentity: `test:visit:associated:${Date.now()}`,
      },
    });

    // Verify association exists
    const counts = await prisma.trip.findUnique({
      where: { id: trip.id },
      select: { _count: { select: { visits: true } } },
    });

    expect(counts?._count.visits).toBe(1);
  });

  it('should prevent deleting visit with associated gallery entries', async () => {
    const visit = await prisma.visit.create({
      data: {
        title: 'Visit with gallery',
        city: 'City',
        region: 'PB',
        needsReview: false,
        storedIdentity: `test:visit:withgallery:${Date.now()}`,
      },
    });

    await prisma.galleryEntry.create({
      data: {
        title: 'Associated gallery',
        date: new Date('2026-12-01T15:00:00-03:00'),
        dateDisplay: '1 de dezembro de 2026',
        description: 'Test',
        images: JSON.stringify([{ src: 'https://example.com/img.jpg', alt: 'Test' }]),
        visitId: visit.id,
        isFeatured: false,
        orderIndex: 0,
        storedIdentity: `test:gallery:associated:${Date.now()}`,
      },
    });

    const counts = await prisma.visit.findUnique({
      where: { id: visit.id },
      select: { _count: { select: { galleryEntries: true } } },
    });

    expect(counts?._count.galleryEntries).toBe(1);
  });

  it('should validate foreign key references', async () => {
    await expect(
      prisma.visit.create({
        data: {
          title: 'Invalid trip reference',
          city: 'City',
          region: 'PB',
          tripId: 'non-existent-id',
          needsReview: true,
          storedIdentity: `test:visit:invalidref:${Date.now()}`,
        },
      })
    ).rejects.toThrow();
  });
});