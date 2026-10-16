import { hasAnyRole, isMemberRoleAbsent, PROTECTED_ROLES, toRoleList } from '@/features/auth/roles';
import { ENV } from '@/lib/env';
import type { SignInSchema } from './schemas';

/** Shared with every step below so an outage reports the same message regardless of which fetch failed. */
export const VERIFICATION_FAILED_MESSAGE = 'No se pudo verificar el acceso. Inténtalo de nuevo.';

export async function performSignInRequest(
  credentials: SignInSchema,
  baseUrl: string = ENV.API_BASE_URL,
): Promise<{ sessionCookie: string }> {
  const signInResponse = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    // Node's fetch sends `Sec-Fetch-Mode`, which makes better-auth reject the request without an Origin.
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(credentials),
  });

  if (!signInResponse.ok) {
    throw new Error('Correo o contraseña inválidos.');
  }

  const sessionCookie = signInResponse.headers.get('Set-Cookie');
  if (!sessionCookie) {
    throw new Error('No se recibió un token de sesión');
  }

  return { sessionCookie };
}

/** Call after `setupOrganization`. A failed lookup is an outage, not an unauthorized user. */
export async function validateStaffMembership(
  sessionCookie: string,
  baseUrl: string = ENV.API_BASE_URL,
): Promise<void> {
  let memberRoleResponse: Response;

  try {
    memberRoleResponse = await fetch(`${baseUrl}/api/auth/organization/get-active-member-role`, {
      headers: { Cookie: sessionCookie, Origin: baseUrl },
    });
  } catch (error) {
    throw new Error(VERIFICATION_FAILED_MESSAGE, { cause: error });
  }

  if (!memberRoleResponse.ok) {
    if (isMemberRoleAbsent(memberRoleResponse.status)) {
      throw new Error('No tienes permiso para acceder a esta aplicación.');
    }
    throw new Error(VERIFICATION_FAILED_MESSAGE);
  }

  const { role } = await memberRoleResponse.json();

  if (!hasAnyRole(toRoleList(role), PROTECTED_ROLES)) {
    throw new Error('No tienes permiso para acceder a esta aplicación.');
  }
}

/** An empty 200 response means citizen. A non-OK response means the lookup failed. */
export async function setupOrganization(sessionCookie: string, baseUrl: string = ENV.API_BASE_URL): Promise<string> {
  let orgListResponse: Response;

  try {
    orgListResponse = await fetch(`${baseUrl}/api/auth/organization/list`, {
      headers: {
        Cookie: sessionCookie,
        Origin: baseUrl,
      },
    });
  } catch (error) {
    throw new Error(VERIFICATION_FAILED_MESSAGE, { cause: error });
  }

  if (!orgListResponse.ok) {
    throw new Error(VERIFICATION_FAILED_MESSAGE);
  }

  const organizations = await orgListResponse.json();

  if (!organizations || organizations.length === 0) {
    return sessionCookie;
  }

  const [firstOrg] = organizations;

  const setActiveResponse = await fetch(`${baseUrl}/api/auth/organization/set-active`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
      Origin: baseUrl,
    },
    body: JSON.stringify({ organizationId: firstOrg.id }),
  });

  if (!setActiveResponse.ok) {
    throw new Error('No se pudo establecer la organización activa');
  }

  const newSessionCookie = setActiveResponse.headers.get('Set-Cookie');
  if (newSessionCookie) {
    const [newCookie] = newSessionCookie.split(';');
    if (newCookie) {
      return newCookie;
    }
  }

  return sessionCookie;
}
