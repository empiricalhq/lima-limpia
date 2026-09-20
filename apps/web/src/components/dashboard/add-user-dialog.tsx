'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailIcon, UserIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { type Control, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { InputPasswordContainer } from '@/components/auth/input-password';
import { InputStartIcon } from '@/components/auth/input-start-icon';
import { RoleSelect } from '@/components/auth/role-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { createUser } from '@/features/auth/actions';
import { type SignUpSchema, signUpSchema } from '@/features/auth/schemas';
import { cn } from '@/lib/utils';

function AddUserFormFields({ control, isPending }: { control: Control<SignUpSchema>; isPending: boolean }) {
  const getInputClassName = (hasError: boolean) => cn(hasError && 'border-destructive');

  return (
    <>
      <FormField
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Nombre completo</FormLabel>
            <FormControl>
              <InputStartIcon icon={UserIcon}>
                <Input
                  className={cn('peer ps-9', getInputClassName(Boolean(fieldState.error)))}
                  disabled={isPending}
                  {...field}
                />
              </InputStartIcon>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Correo electrónico</FormLabel>
            <FormControl>
              <InputStartIcon icon={MailIcon}>
                <Input
                  type="email"
                  className={cn('peer ps-9', getInputClassName(Boolean(fieldState.error)))}
                  disabled={isPending}
                  {...field}
                />
              </InputStartIcon>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Contraseña</FormLabel>
            <FormControl>
              <InputPasswordContainer>
                <Input
                  type="password"
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
        control={control}
        name="confirmPassword"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Confirmar contraseña</FormLabel>
            <FormControl>
              <InputPasswordContainer>
                <Input
                  type="password"
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
        name="role"
        control={control}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Rol</FormLabel>
            <FormControl>
              <RoleSelect value={field.value} onChange={field.onChange} disabled={isPending} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

function AddUserForm({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<SignUpSchema>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'driver',
    },
  });

  function onSubmit(data: SignUpSchema) {
    startTransition(async () => {
      const result = await createUser(data);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Usuario creado: ${data.name}`);
        onClose();
        form.reset();
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4">
        <AddUserFormFields control={form.control} isPending={isPending} />
        <Button type="submit" disabled={isPending} className="mt-2 w-full cursor-pointer">
          Crear usuario
        </Button>
      </form>
    </Form>
  );
}

export function AddUserDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button className="cursor-pointer" onClick={() => setIsOpen(true)}>
        Añadir usuario
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir nuevo usuario</DialogTitle>
          </DialogHeader>
          <AddUserForm onClose={() => setIsOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
