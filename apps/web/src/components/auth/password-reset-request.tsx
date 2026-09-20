'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AuthContainer } from '@/components/auth/auth-container';
import { contentVariants } from '@/components/auth/auth-motion';
import { AuthStatus } from '@/components/auth/auth-status';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '@/features/auth/actions';
import { type RequestPasswordResetSchema, requestPasswordResetSchema } from '@/features/auth/schemas';
import { cn } from '@/lib/utils';

interface RequestFormProps {
  form: ReturnType<typeof useForm<RequestPasswordResetSchema>>;
  onSubmit: (data: RequestPasswordResetSchema) => void;
  isPending: boolean;
}

function RequestForm({ form, onSubmit, isPending }: RequestFormProps) {
  return (
    <>
      <div className="flex flex-col items-center text-center gap-2">
        <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
        <p className="text-muted-foreground text-balance">
          Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex w-full flex-col gap-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <FormItem>
                <Label htmlFor="email">Correo electrónico</Label>
                <FormControl>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Ingresa tu correo electrónico"
                    className={cn(fieldState.error && 'border-destructive')}
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
    </>
  );
}

function EmailSent() {
  return (
    <AuthStatus
      tone="success"
      label="Correo enviado exitosamente"
      title="Revisa tu correo"
      description="Si tu dirección está registrada, recibirás un enlace para restablecer tu contraseña."
    >
      <Link href="/signin" className="mt-8 inline-block">
        <Button variant="outline" className="transition-colors duration-200 ease-out">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a iniciar sesión
        </Button>
      </Link>
    </AuthStatus>
  );
}

/** Asks for an email address and reports that the reset link was sent. */
export function PasswordResetRequest() {
  const [isPending, startTransition] = useTransition();
  const [isSent, setIsSent] = useState(false);

  const form = useForm<RequestPasswordResetSchema>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });

  function onSubmit(data: RequestPasswordResetSchema) {
    startTransition(async () => {
      const result = await requestPasswordReset(data);
      if (result?.error) {
        toast.error(result.error);
      } else if (result?.success) {
        setIsSent(true);
        toast.success(result.message);
      }
    });
  }

  return (
    <AuthContainer showBrandImage={true} footer={<div className="h-5" />}>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={isSent ? 'email-sent' : 'request'}
          variants={contentVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {isSent ? <EmailSent /> : <RequestForm form={form} onSubmit={onSubmit} isPending={isPending} />}
        </motion.div>
      </AnimatePresence>
    </AuthContainer>
  );
}
