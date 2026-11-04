import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  error,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
}) {
  if (error) return <div role="alert" className="p-6 text-center text-sm text-destructive">{error}</div>;
  if (!loading && rows.length === 0) return <>{empty}</>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key}>{c.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? [0, 1, 2].map((i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    <Skeleton className="h-5 w-full max-w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((c) => (
                  <TableCell key={c.key}>{c.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
