import type { Metadata } from 'next';
import { InvalidResetLink } from '@/components/auth/invalid-reset-link';
import { PasswordResetConfirm } from '@/components/auth/password-reset-confirm';

export const metadata: Metadata = {
  title: 'Restablecer contraseña - Lima Limpia',
  description: 'Establece una nueva contraseña para tu cuenta',
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

// better-auth appends ?token= on a usable link and ?error= on one it rejected.
// Reading it here keeps the password form out of the response when the link
// cannot work, instead of rendering the form and replacing it after hydration.
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token, error } = await searchParams;

  if (error || !token) {
    return <InvalidResetLink />;
  }

  return <PasswordResetConfirm token={token} />;
}
