'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireProtectedRole } from '@/features/auth/lib';
import { PROTECTED_ROLES } from '@/features/auth/roles';
import { api } from '@/lib/api';
import { ENV } from '@/lib/env';
import {
  type RequestPasswordResetSchema,
  type ResetPasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  type SignInSchema,
  type SignUpSchema,
  signInSchema,
  signUpSchema,
} from './schemas';

interface ActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

async function performSignInRequest(credentials: SignInSchema): Promise<{ sessionCookie: string }> {
  const signInResponse = await fetch(`${ENV.API_BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    // Node's fetch sends `Sec-Fetch-Mode`, which makes better-auth reject the request without an Origin.
    headers: { 'Content-Type': 'application/json', Origin: ENV.API_BASE_URL },
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

async function validateUserRole(sessionCookie: string): Promise<void> {
  const sessionResponse = await fetch(`${ENV.API_BASE_URL}/api/auth/get-session`, {
    headers: { Cookie: sessionCookie },
  });
  if (!sessionResponse.ok) {
    throw new Error('Oops. Hubo un problema al verificar tu sesión.');
  }
  const session = await sessionResponse.json();
  const userRole = session?.user?.role;

  if (!(userRole && PROTECTED_ROLES.includes(userRole))) {
    throw new Error('No tienes permiso para acceder a esta aplicación.');
  }
}

async function setSessionCookie(sessionCookie: string): Promise<void> {
  const [, tokenValue] = sessionCookie.split(';')[0].split('=');
  (await cookies()).set('better-auth.session_token', tokenValue, {
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

async function setupOrganization(sessionCookie: string): Promise<string> {
  const orgListResponse = await fetch(`${ENV.API_BASE_URL}/api/auth/organization/list`, {
    headers: {
      Cookie: sessionCookie,
      Origin: ENV.API_BASE_URL,
    },
  });

  if (!orgListResponse.ok) {
    return sessionCookie;
  }

  const organizations = await orgListResponse.json();

  if (!organizations || organizations.length === 0) {
    return sessionCookie;
  }

  // set the first organization as active
  const [firstOrg] = organizations;

  const setActiveResponse = await fetch(`${ENV.API_BASE_URL}/api/auth/organization/set-active`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
      Origin: ENV.API_BASE_URL,
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

export async function signIn(data: SignInSchema): Promise<ActionResult> {
  const validatedFields = signInSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Campos inválidos' };
  }

  try {
    let { sessionCookie } = await performSignInRequest(validatedFields.data);
    await validateUserRole(sessionCookie);

    sessionCookie = await setupOrganization(sessionCookie);

    await setSessionCookie(sessionCookie);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Oops. Ha habido un problema. Inténtalo de nuevo.' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function createUser(data: SignUpSchema): Promise<ActionResult> {
  const validatedFields = signUpSchema.safeParse(data);

  if (!validatedFields.success) {
    return { error: 'Campos inválidos' };
  }

  try {
    await requireProtectedRole();

    const { name, email, password, role } = validatedFields.data;
    await api.admin.createUser({ name, email, password, role });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.toLowerCase().includes('unique constraint')) {
      return { error: 'Un usuario con este correo ya existe' };
    }
    return { error: error instanceof Error ? error.message : 'No se pudo crear el usuario' };
  }

  revalidatePath('/drivers', 'page');
  revalidatePath('/supervisors', 'page');
  return { error: undefined };
}

export async function signOut() {
  (await cookies()).delete('better-auth.session_token');
  // Backend sign-out is best effort. Local cookie deletion must still finish.
  // biome-ignore lint/suspicious/noEmptyBlockStatements: backend sign-out is best effort.
  api.post('/api/auth/sign-out').catch(() => {});
  redirect('/signin');
}

export async function requestPasswordReset(data: RequestPasswordResetSchema): Promise<ActionResult> {
  const validatedFields = requestPasswordResetSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Correo electrónico inválido' };
  }

  try {
    const response = await fetch(`${ENV.API_BASE_URL}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: validatedFields.data.email,
        redirectTo: `${ENV.NEXT_PUBLIC_BASE_URL}/reset-password`,
      }),
    });

    if (!response.ok) {
      throw new Error('No se pudo enviar el correo de restablecimiento');
    }

    return {
      success: true,
      message: 'Solicitud enviada',
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Hubo un problema. Inténtalo de nuevo.' };
  }
}

export async function resetPassword(data: ResetPasswordSchema): Promise<ActionResult> {
  const validatedFields = resetPasswordSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Campos inválidos' };
  }

  try {
    const response = await fetch(`${ENV.API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: validatedFields.data.token,
        newPassword: validatedFields.data.password,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'No se pudo restablecer la contraseña');
    }

    return {
      success: true,
      message: 'Tu contraseña ha sido restablecida exitosamente',
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Hubo un problema. Inténtalo de nuevo.' };
  }
}
