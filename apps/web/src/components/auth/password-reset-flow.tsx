'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AuthContainer } from '@/components/auth/auth-container';
import { InputPasswordContainer } from '@/components/auth/input-password';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset, resetPassword } from '@/features/auth/actions';
import {
  type RequestPasswordResetSchema,
  type ResetPasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from '@/features/auth/schemas';
import { cn } from '@/lib/utils';

const REDIRECT_DELAY_MS = 2000;
// biome-ignore lint/style/noMagicNumbers: standard easing curve.
const EASE_OUT_QUAD = [0.25, 0.46, 0.45, 0.94] as const;
// biome-ignore lint/style/noMagicNumbers: standard easing curve.
const EASE_IN_QUAD = [0.55, 0.085, 0.68, 0.53] as const;
const ANIMATION_DURATION_IN = 0.3;
const ANIMATION_DURATION_OUT = 0.2;

type FlowState = 'request' | 'email-sent' | 'reset' | 'success' | 'error';

interface PasswordResetFlowProps extends React.ComponentProps<'div'> {
  mode?: 'request' | 'reset';
}

const contentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATION_IN,
      ease: EASE_OUT_QUAD as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: ANIMATION_DURATION_OUT,
      ease: EASE_IN_QUAD as [number, number, number, number],
    },
  },
};

interface RequestPasswordResetViewProps {
  requestForm: ReturnType<typeof useForm<RequestPasswordResetSchema>>;
  onRequestSubmit: (data: RequestPasswordResetSchema) => void;
  isPending: boolean;
  getInputClassName: (hasError: boolean) => string;
}

function RequestPasswordResetView({
  requestForm,
  onRequestSubmit,
  isPending,
  getInputClassName,
}: RequestPasswordResetViewProps) {
  return (
    <motion.div key="request" variants={contentVariants} initial="initial" animate="animate" exit="exit">
      <div className="flex flex-col items-center text-center gap-2">
        <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
        <p className="text-muted-foreground text-balance">
          Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña
        </p>
      </div>
      <Form {...requestForm}>
        <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className="mt-6 flex w-full flex-col gap-5">
          <FormField
            control={requestForm.control}
            name="email"
            render={({ field, fieldState }) => (
              <FormItem>
                <Label htmlFor="email">Correo electrónico</Label>
                <FormControl>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Ingresa tu correo electrónico"
                    className={getInputClassName(Boolean(fieldState.error))}
                    disabled={isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending} className="w-full cursor-pointer">
            {isPending ? 'Enviando...' : 'Enviar enlace'}
          </Button>

          <div className="text-center">
            <Link
              href="/signin"
              className="text-muted-foreground hover:text-primary text-sm underline-offset-4 transition-colors duration-200 ease-out hover:underline"
            >
              <ArrowLeft className="mr-1 inline h-3 w-3" />
              Volver a iniciar sesión
            </Link>
          </div>
        </form>
      </Form>
    </motion.div>
  );
}

function EmailSentView() {
  return (
    <motion.div key="email-sent" variants={contentVariants} initial="initial" animate="animate" exit="exit">
      <div className="flex flex-col items-center text-center">
        <div className="bg-green-100 text-green-600 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-8 w-8"
            role="img"
            aria-label="Correo enviado exitosamente"
          >
            <title>Correo enviado exitosamente</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">Revisa tu correo</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Si tu dirección está registrada, recibirás un enlace para restablecer tu contraseña.
        </p>
        <div>
          <Link href="/signin" className="mt-8 inline-block">
            <Button variant="outline" className="transition-colors duration-200 ease-out">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a iniciar sesión
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

interface ResetPasswordViewProps {
  resetForm: ReturnType<typeof useForm<ResetPasswordSchema>>;
  onResetSubmit: (data: ResetPasswordSchema) => void;
  isPending: boolean;
  getInputClassName: (hasError: boolean) => string;
}

function ResetPasswordView({ resetForm, onResetSubmit, isPending, getInputClassName }: ResetPasswordViewProps) {
  return (
    <motion.div key="reset" variants={contentVariants} initial="initial" animate="animate" exit="exit">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
        <p className="text-muted-foreground text-balance">Ingresa tu nueva contraseña</p>
      </div>
      <Form {...resetForm}>
        <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="mt-6 flex w-full flex-col gap-5">
          <input type="hidden" {...resetForm.register('token')} />

          <FormField
            control={resetForm.control}
            name="password"
            render={({ field, fieldState }) => (
              <FormItem>
                <Label htmlFor="password">Nueva contraseña</Label>
                <FormControl>
                  <InputPasswordContainer>
                    <Input
                      id="password"
                      type="password"
                      placeholder=""
                      className={cn('pe-9', getInputClassName(Boolean(fieldState.error)))}
                      disabled={isPending}
                      {...field}
                    />
                  </InputPasswordContainer>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={resetForm.control}
            name="confirmPassword"
            render={({ field, fieldState }) => (
              <FormItem>
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <FormControl>
                  <InputPasswordContainer>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder=""
                      className={cn('pe-9', getInputClassName(Boolean(fieldState.error)))}
                      disabled={isPending}
                      {...field}
                    />
                  </InputPasswordContainer>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending} className="mt-2 w-full cursor-pointer">
            {isPending ? 'Restableciendo...' : 'Restablecer contraseña'}
          </Button>

          <div className="text-center text-sm">
            <Link
              href="/signin"
              className="text-muted-foreground hover:text-primary underline-offset-4 transition-colors duration-200 ease-out hover:underline"
            >
              Volver a iniciar sesión
            </Link>
          </div>
        </form>
      </Form>
    </motion.div>
  );
}

function SuccessView() {
  return (
    <motion.div key="success" variants={contentVariants} initial="initial" animate="animate" exit="exit">
      <div className="flex flex-col items-center text-center">
        <div className="bg-green-100 text-green-600 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-8 w-8"
            role="img"
            aria-label="Contraseña actualizada exitosamente"
          >
            <title>Contraseña actualizada exitosamente</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">¡Contraseña actualizada!</h1>
        <p className="text-muted-foreground mt-2 text-balance">
          Tu contraseña ha sido restablecida exitosamente. Serás redirigido a la página de inicio de sesión.
        </p>
      </div>
    </motion.div>
  );
}

function ErrorView() {
  return (
    <motion.div key="error" variants={contentVariants} initial="initial" animate="animate" exit="exit">
      <div className="flex flex-col items-center text-center">
        <div className="bg-red-100 text-red-600 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-8 w-8"
            role="img"
            aria-label="Error: enlace inválido"
          >
            <title>Error: enlace inválido</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">Enlace inválido</h1>
        <p className="text-muted-foreground mt-2 text-balance">
          El enlace de restablecimiento es inválido o ha expirado.
        </p>
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
      </div>
    </motion.div>
  );
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: coordinates two related forms (request/reset) that share flow state; splitting would just move code around.
export function PasswordResetFlow({ className, mode = 'request', ...props }: PasswordResetFlowProps) {
  const [isPending, startTransition] = useTransition();
  const [flowState, setFlowState] = useState<FlowState>(mode === 'reset' ? 'reset' : 'request');
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const error = searchParams.get('error');

  const requestForm = useForm<RequestPasswordResetSchema>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });

  const resetForm = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: token || '',
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (mode === 'reset' && (error || !token)) {
      setFlowState('error');
      if (error) {
        toast.error('El enlace de restablecimiento es inválido o ha expirado');
      } else {
        toast.error('Falta el token de restablecimiento');
      }
    }
  }, [error, token, mode]);

  function onRequestSubmit(data: RequestPasswordResetSchema) {
    startTransition(async () => {
      const result = await requestPasswordReset(data);
      if (result?.error) {
        toast.error(result.error);
      } else if (result?.success) {
        setFlowState('email-sent');
        toast.success(result.message);
      }
    });
  }

  function onResetSubmit(data: ResetPasswordSchema) {
    startTransition(async () => {
      const result = await resetPassword(data);
      if (result?.error) {
        toast.error(result.error);
      } else if (result?.success) {
        setFlowState('success');
        toast.success(result.message);
        setTimeout(() => {
          router.push('/signin');
        }, REDIRECT_DELAY_MS);
      }
    });
  }

  const getInputClassName = (hasError: boolean) => cn(hasError && 'border-destructive');

  return (
    <AuthContainer showBrandImage={true} className={className} footer={<div className="h-5" />} {...props}>
      <AnimatePresence mode="popLayout">
        {flowState === 'request' && (
          <RequestPasswordResetView
            requestForm={requestForm}
            onRequestSubmit={onRequestSubmit}
            isPending={isPending}
            getInputClassName={getInputClassName}
          />
        )}

        {flowState === 'email-sent' && <EmailSentView />}

        {flowState === 'reset' && (
          <ResetPasswordView
            resetForm={resetForm}
            onResetSubmit={onResetSubmit}
            isPending={isPending}
            getInputClassName={getInputClassName}
          />
        )}

        {flowState === 'success' && <SuccessView />}

        {flowState === 'error' && <ErrorView />}
      </AnimatePresence>
    </AuthContainer>
  );
}
