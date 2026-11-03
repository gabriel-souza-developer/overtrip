import { describe, expect, it } from 'vitest';
import { galleryUpdateSchema, tripUpdateSchema, visitUpdateSchema } from '../src/validators/index.js';

describe('partial updates do not apply create defaults', () => {
  it('leaves omitted trip fields unchanged', () => {
    expect(tripUpdateSchema.parse({})).toEqual({});
    expect(tripUpdateSchema.parse({ free: true })).toEqual({ free: true });
  });

  it('leaves omitted visit and gallery fields unchanged', () => {
    expect(visitUpdateSchema.parse({})).toEqual({});
    expect(galleryUpdateSchema.parse({})).toEqual({});
    expect(galleryUpdateSchema.parse({ isFeatured: true })).toEqual({ isFeatured: true });
  });
});
