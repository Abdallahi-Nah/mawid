import type { Page, Pagination } from '@mawid/shared';

export const skipTake = (p: Pagination): { skip: number; take: number } => ({
  skip: (p.page - 1) * p.pageSize,
  take: p.pageSize,
});

export const toPage = <T>(items: T[], total: number, p: Pagination): Page<T> => ({
  items,
  total,
  page: p.page,
  pageSize: p.pageSize,
});
