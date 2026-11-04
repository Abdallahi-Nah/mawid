import { slugify } from './auth.service';

describe('slugify', () => {
  it('makes a URL-safe slug', () => {
    expect(slugify('Salon Nour')).toBe('salon-nour');
    expect(slugify('  Clinique Al-Chifà !! ')).toBe('clinique-al-chifa');
  });
  it('falls back for names without latin letters', () => {
    expect(slugify('صالون نور')).toBe('business');
  });
});
