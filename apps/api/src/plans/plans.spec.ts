import { limitsFor } from './plans';

describe('plan limits (FR-91)', () => {
  it('FREE is limited, PRO is larger, BUSINESS has no staff or booking limit', () => {
    const free = limitsFor('FREE', 1000);
    const pro = limitsFor('PRO', 1000);
    const biz = limitsFor('BUSINESS', 1000);
    expect(free).toEqual({ staff: 2, bookingsPerMonth: 50, aiMessagesPerMonth: 1000 });
    expect(pro.staff).toBeGreaterThan(free.staff as number);
    expect(pro.bookingsPerMonth).toBeGreaterThan(free.bookingsPerMonth as number);
    expect(pro.aiMessagesPerMonth).toBe(10_000);
    expect(biz.staff).toBeNull();
    expect(biz.bookingsPerMonth).toBeNull();
  });
});
