import { type NextRequest, NextResponse } from 'next/server';
import type { AuthContext } from './features/auth/lib';
import { hasAnyRole, PROTECTED_ROLES, SETTINGS_ROLES } from './features/auth/roles';
import { ENV } from './lib/env';

const AUTH_ROUTES = ['/signin'];
const PROTECTED_ROUTE_PREFIX = '/dashboard';
const SETTINGS_ROUTE_PREFIX = '/settings';

async function getAuthFromRequest(request: NextRequest): Promise<AuthContext | null> {
  const token = request.cookies.get('better-auth.session_token')?.value;
  if (!token) {
    return null;
  }

  const headers = { Cookie: `better-auth.session_token=${token}` };

  try {
    const sessionRes = await fetch(`${ENV.API_BASE_URL}/api/auth/get-session`, { headers, cache: 'no-store' });

    if (!sessionRes.ok) {
      return null;
    }
    const sessionData = await sessionRes.json();

    return {
      user: sessionData.user,
      session: sessionData.session,
    };
  } catch {
    return null;
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

  const auth = await getAuthFromRequest(request);
  const isAuthenticated = Boolean(auth?.user);
  const userRoles = auth?.user?.role?.split(',') ?? [];

  if (AUTH_ROUTES.includes(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL(PROTECTED_ROUTE_PREFIX, request.url));
  }

  const isProtectedRoute = pathname.startsWith(PROTECTED_ROUTE_PREFIX);

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
