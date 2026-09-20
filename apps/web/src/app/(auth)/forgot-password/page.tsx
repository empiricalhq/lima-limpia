import type { Metadata } from 'next';
import { PasswordResetRequest } from '@/components/auth/password-reset-request';

export const metadata: Metadata = {
  title: 'Olvidé mi contraseña - Lima Limpia',
  description: 'Restablece tu contraseña de Lima Limpia',
};

export default function ForgotPasswordPage() {
  return <PasswordResetRequest />;
}
