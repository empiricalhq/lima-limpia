import Link from 'next/link';
import { AuthContainer } from '@/components/auth/auth-container';
import { AuthStatus } from '@/components/auth/auth-status';
import { Button } from '@/components/ui/button';

/** Shown instead of the password form when the reset link cannot work. */
export function InvalidResetLink() {
  return (
    <AuthContainer showBrandImage={true} footer={<div className="h-5" />}>
      <AuthStatus
        tone="error"
        label="Error: enlace inválido"
        title="Enlace inválido"
        description="El enlace de restablecimiento es inválido o ha expirado."
      >
        <div className="mt-6 flex gap-3">
          <Link href="/forgot-password">
            <Button className="transition-colors duration-200 ease-out">Solicitar nuevo enlace</Button>
          </Link>
          <Link href="/signin">
            <Button variant="outline" className="transition-colors duration-200 ease-out">
              Iniciar sesión
            </Button>
          </Link>
        </div>
      </AuthStatus>
    </AuthContainer>
  );
}
