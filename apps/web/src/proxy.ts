import { type NextRequest, NextResponse } from 'next/server';
import type { AuthContext } from './features/auth/lib';
import { hasAnyRole, isMemberRoleAbsent, PROTECTED_ROLES, SETTINGS_ROLES, toRoleList } from './features/auth/roles';
import { ENV } from './lib/env';

const AUTH_ROUTES = ['/signin'];
const PROTECTED_ROUTE_PREFIX = '/dashboard';
const SETTINGS_ROUTE_PREFIX = '/settings';

type AuthLookup =
  | { status: 'unauthenticated' }
  /** The member-role lookup itself failed (5xx, network error) — distinct from a real "no role" answer. */
  | { status: 'lookup-failed' }
  | { status: 'ok'; auth: AuthContext };

/** Null roles means the lookup failed; the caller must not read that as "no role". */
async function fetchMemberRoles(headers: HeadersInit): Promise<string[] | null> {
  try {
    const res = await fetch(`${ENV.API_BASE_URL}/api/auth/organization/get-active-member-role`, {
      headers,
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return toRoleList(data?.role);
    }

    return isMemberRoleAbsent(res.status) ? [] : null;
  } catch {
    return null;
  }
}

/** Better Auth's global `user.role` is not the source of staff access checks; organization membership is. */
async function getAuthFromRequest(request: NextRequest): Promise<AuthLookup> {
  const token = request.cookies.get('better-auth.session_token')?.value;
  if (!token) {
    return { status: 'unauthenticated' };
  }

  const headers = { Cookie: `better-auth.session_token=${token}` };

  try {
    const sessionRes = await fetch(`${ENV.API_BASE_URL}/api/auth/get-session`, { headers, cache: 'no-store' });

    if (!sessionRes.ok) {
      return { status: 'unauthenticated' };
    }
    const sessionData = await sessionRes.json();
    if (!sessionData?.session) {
      return { status: 'unauthenticated' };
    }

    const roles = await fetchMemberRoles(headers);
    if (roles === null) {
      return { status: 'lookup-failed' };
    }

    return {
      status: 'ok',
      auth: { user: sessionData.user, session: sessionData.session, roles },
    };
  } catch {
    return { status: 'unauthenticated' };
  }
}

function isBypassedPath(pathname: string): boolean {
  return pathname.startsWith('/_next/') || pathname.includes('.') || pathname.startsWith('/api');
}

function redirectToSignIn(request: NextRequest, pathname: string): NextResponse {
  const signInUrl = new URL('/signin', request.url);
  signInUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(signInUrl);
}

/** The member-role lookup failed; fail the request but keep the session, since the user's role is still unknown. */
function serviceUnavailable(): NextResponse {
  return new NextResponse('No se pudo verificar el acceso. Inténtalo de nuevo.', { status: 503 });
}

function guardProtectedRoute(request: NextRequest, pathname: string, userRoles: string[]): NextResponse | null {
  if (!hasAnyRole(userRoles, PROTECTED_ROLES)) {
    const response = NextResponse.redirect(new URL('/signin', request.url));
    response.cookies.delete('better-auth.session_token');
    return response;
  }

  if (pathname.startsWith(SETTINGS_ROUTE_PREFIX) && !hasAnyRole(userRoles, SETTINGS_ROLES)) {
    return NextResponse.redirect(new URL(PROTECTED_ROUTE_PREFIX, request.url));
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API and asset requests do not need the page access check.
  if (isBypassedPath(pathname)) {
    return NextResponse.next();
  }

  const lookup = await getAuthFromRequest(request);
  const isProtectedRoute = pathname.startsWith(PROTECTED_ROUTE_PREFIX);

  if (lookup.status === 'lookup-failed') {
    return isProtectedRoute ? serviceUnavailable() : NextResponse.next();
  }

  const isAuthenticated = lookup.status === 'ok';
  const userRoles = lookup.status === 'ok' ? lookup.auth.roles : [];

  if (AUTH_ROUTES.includes(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL(PROTECTED_ROUTE_PREFIX, request.url));
  }

  if (isProtectedRoute && !isAuthenticated) {
    return redirectToSignIn(request, pathname);
  }

  if (isProtectedRoute && isAuthenticated) {
    const guardResponse = guardProtectedRoute(request, pathname, userRoles);
    if (guardResponse) {
      return guardResponse;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
