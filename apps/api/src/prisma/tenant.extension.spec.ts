import { scopeArgs } from './tenant.extension';

const A = 'business-a';

describe('scopeArgs', () => {
  it('adds businessId to reads', () => {
    expect(scopeArgs('Service', 'findMany', { where: { active: true } }, A)).toEqual({
      where: { active: true, businessId: A },
    });
    expect(scopeArgs('Service', 'findMany', undefined, A)).toEqual({ where: { businessId: A } });
  });

  it('overwrites a businessId given by the caller (cannot target another tenant)', () => {
    expect(scopeArgs('Staff', 'findFirst', { where: { businessId: 'business-b' } }, A)).toEqual({
      where: { businessId: A },
    });
    expect(
      scopeArgs('Staff', 'create', { data: { displayName: 'X', businessId: 'business-b' } }, A),
    ).toEqual({
      data: { displayName: 'X', businessId: A },
    });
  });

  it('scopes unique operations (update, delete, findUnique)', () => {
    for (const op of ['findUnique', 'update', 'delete']) {
      expect(scopeArgs('Booking', op, { where: { id: '1' } }, A)).toMatchObject({
        where: { id: '1', businessId: A },
      });
    }
  });

  it('scopes createMany and upsert', () => {
    expect(
      scopeArgs('Customer', 'createMany', { data: [{ name: 'a' }, { name: 'b' }] }, A),
    ).toEqual({
      data: [
        { name: 'a', businessId: A },
        { name: 'b', businessId: A },
      ],
    });
    expect(
      scopeArgs('Customer', 'upsert', { where: { id: '1' }, create: { name: 'a' }, update: {} }, A),
    ).toMatchObject({
      where: { id: '1', businessId: A },
      create: { name: 'a', businessId: A },
    });
  });

  it('scopes the Business model by id and forbids creating businesses', () => {
    expect(scopeArgs('Business', 'findUnique', { where: { id: 'business-b' } }, A)).toEqual({
      where: { id: A },
    });
    expect(() => scopeArgs('Business', 'create', { data: {} }, A)).toThrow();
  });

  it('fails closed on models without business_id and on unknown operations', () => {
    expect(() => scopeArgs('RefreshToken', 'findMany', {}, A)).toThrow(/not available/);
    expect(() => scopeArgs('Staff', 'dropEverything', {}, A)).toThrow(/not allowed/);
  });
});
