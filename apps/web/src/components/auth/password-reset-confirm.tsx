'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AuthContainer } from '@/components/auth/auth-container';
import { contentVariants } from '@/components/auth/auth-motion';
import { AuthStatus } from '@/components/auth/auth-status';
import { InputPasswordContainer } from '@/components/auth/input-password';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '@/features/auth/actions';
import { type ResetPasswordSchema, resetPasswordSchema } from '@/features/auth/schemas';
import { cn } from '@/lib/utils';

const REDIRECT_DELAY_MS = 2000;

interface ResetFormProps {
  form: ReturnType<typeof useForm<ResetPasswordSchema>>;
  onSubmit: (data: ResetPasswordSchema) => void;
  isPending: boolean;
}

function ResetForm({ form, onSubmit, isPending }: ResetFormProps) {
  return (
    <>
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
        <p className="text-muted-foreground text-balance">Ingresa tu nueva contraseña</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex w-full flex-col gap-5">
          <input type="hidden" {...form.register('token')} />

          <FormField
            control={form.control}
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
                      className={cn('pe-9', fieldState.error && 'border-destructive')}
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
            control={form.control}
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
                      className={cn('pe-9', fieldState.error && 'border-destructive')}
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
    </>
  );
}

/** Takes a new password for a reset link the server already accepted. */
export function PasswordResetConfirm({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [isReset, setIsReset] = useState(false);
  const router = useRouter();

  const form = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  function onSubmit(data: ResetPasswordSchema) {
    startTransition(async () => {
      const result = await resetPassword(data);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.success) {
        setIsReset(true);
        toast.success(result.message);
        setTimeout(() => router.push('/signin'), REDIRECT_DELAY_MS);
      }
    });
  }

  return (
    <AuthContainer showBrandImage={true} footer={<div className="h-5" />}>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={isReset ? 'success' : 'reset'}
          variants={contentVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {isReset ? (
            <AuthStatus
              tone="success"
              label="Contraseña actualizada exitosamente"
              title="¡Contraseña actualizada!"
              description="Tu contraseña ha sido restablecida exitosamente. Serás redirigido a la página de inicio de sesión."
            />
          ) : (
            <ResetForm form={form} onSubmit={onSubmit} isPending={isPending} />
          )}
        </motion.div>
      </AnimatePresence>
    </AuthContainer>
  );
}
