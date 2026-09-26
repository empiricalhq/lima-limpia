import 'server-only';
import { cookies } from 'next/headers';
import type { AuthContext } from '@/features/auth/lib';
import type { CreateIssueSchema } from '@/features/issues/schemas';
import type { CreateRouteSchema } from '@/features/routes/schemas';
import type { Issue, Route, Truck, User } from './api-contract';
import { ENV } from './env';

const HTTP_NO_CONTENT = 204;
const HTTP_SERVICE_UNAVAILABLE = 503;
const ERROR_MESSAGES: Record<number, string> = {
  422: 'El usuario ya ha sido registrado',
};

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function handleSessionCookie(response: Response): Promise<void> {
  const setCookieHeader = response.headers.get('Set-Cookie');
  if (!setCookieHeader) {
    return;
  }

  const [, tokenValue] = setCookieHeader.split(';')[0].split('=');
  (await cookies()).set('better-auth.session_token', tokenValue, {
    httpOnly: true,
    path: '/',
    secure: ENV.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

function buildRequestHeaders(options: RequestInit, sessionToken: string | undefined): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (sessionToken) {
    headers.set('Cookie', `better-auth.session_token=${sessionToken}`);
  }
  return headers;
}

function resolveCacheConfig(revalidate: number | undefined): RequestInit {
  // Lists change less often. Other requests must always read current data.
  return revalidate === undefined ? { cache: 'no-store' } : { next: { revalidate } };
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const errorData = await response.json().catch(() => ({ error: response.statusText }));
  const message = ERROR_MESSAGES[response.status] || errorData.error || `API Error: ${response.status}`;
  throw new ApiError(message, response.status);
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  if (response.status === HTTP_NO_CONTENT) {
    return null as T;
  }
  const jsonResponse = await response.json();
  if (jsonResponse === null || jsonResponse === undefined) {
    return null as T;
  }
  return 'data' in jsonResponse ? (jsonResponse.data as T) : (jsonResponse as T);
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  apiOptions: { ignoreSetCookie?: boolean; revalidate?: number } = {},
): Promise<T> {
  const url = `${ENV.API_BASE_URL}${endpoint}`;
  const sessionToken = (await cookies()).get('better-auth.session_token')?.value;
  const headers = buildRequestHeaders(options, sessionToken);
  const config: RequestInit = { ...options, headers, ...resolveCacheConfig(apiOptions.revalidate) };

  try {
    const response = await fetch(url, config);

    if (!apiOptions.ignoreSetCookie) {
      await handleSessionCookie(response);
    }

    await assertOk(response);
    return await parseResponseBody<T>(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // biome-ignore lint/style/useErrorCause: the rule doesn't see `cause` passed through ApiError's options param, but it reaches super(message, options).
    throw new ApiError(error instanceof Error ? error.message : 'API connection failed', HTTP_SERVICE_UNAVAILABLE, {
      cause: error,
    });
  }
}

function post<T>(endpoint: string, body?: unknown, apiOptions?: { ignoreSetCookie?: boolean }): Promise<T> {
  return request<T>(
    endpoint,
    {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    },
    apiOptions,
  );
}

const admin = {
  getDrivers: () => request<User[]>('/api/admin/drivers', {}, { ignoreSetCookie: true, revalidate: 60 }),
  createDriver: (data: { name: string; email: string; password: string }) =>
    post<User>('/api/admin/drivers', data, { ignoreSetCookie: true }),
  createUser: (data: { name: string; email: string; password: string; role: 'admin' | 'supervisor' | 'driver' }) =>
    post<User>('/api/admin/users', data, { ignoreSetCookie: true }),
  updateUser: (id: string, data: { name: string; email: string; password?: string }) =>
    request<User>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, { ignoreSetCookie: true }),

  getSupervisors: () => request<User[]>('/api/admin/supervisors', {}, { ignoreSetCookie: true, revalidate: 60 }),

  getTrucks: () => request<Truck[]>('/api/admin/trucks', {}, { ignoreSetCookie: true }),
  getRoutes: () => request<Route[]>('/api/admin/routes', {}, { ignoreSetCookie: true, revalidate: 60 }),
  getOpenIssues: () => request<Issue[]>('/api/admin/issues', {}, { ignoreSetCookie: true }),
  createRoute: (data: CreateRouteSchema) => post<Route>('/api/admin/routes', data, { ignoreSetCookie: true }),
  createIssue: (data: CreateIssueSchema) => post<Issue>('/api/admin/issues', data, { ignoreSetCookie: true }),
};

const auth = {
  getSession: () => request<AuthContext | null>('/api/auth/get-session'),
};

export const api = {
  admin,
  auth,
  post,
};
