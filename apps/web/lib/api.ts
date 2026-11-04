// Typed client for the Mawid API. Cookies are httpOnly, so the browser sends them itself (credentials: include).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(code);
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
}

let refreshing: Promise<boolean> | null = null;

// One refresh at a time, even if several requests get a 401 together.
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(path: string, o: Options): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: o.method ?? 'GET',
    credentials: 'include',
    headers: o.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
  });
}

export async function api<T>(path: string, o: Options = {}): Promise<T> {
  let res = await send(path, o);
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession()))
    res = await send(path, o);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      details?: ApiError['details'];
    };
    throw new ApiError(res.status, data.code ?? 'UNKNOWN', data.details);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
