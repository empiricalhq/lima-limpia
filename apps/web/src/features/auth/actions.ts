'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireProtectedRole } from '@/features/auth/lib';
import { performSignInRequest, setupOrganization, validateStaffMembership } from '@/features/auth/sign-in-flow';
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

async function setSessionCookie(sessionCookie: string): Promise<void> {
  const [, tokenValue] = sessionCookie.split(';')[0].split('=');
  (await cookies()).set('better-auth.session_token', tokenValue, {
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

export async function signIn(data: SignInSchema): Promise<ActionResult> {
  const validatedFields = signInSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Campos inválidos' };
  }

  try {
    let { sessionCookie } = await performSignInRequest(validatedFields.data);
    sessionCookie = await setupOrganization(sessionCookie);
    await validateStaffMembership(sessionCookie);

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
