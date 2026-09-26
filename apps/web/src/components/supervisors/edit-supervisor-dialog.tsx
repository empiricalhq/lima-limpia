'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { updateSupervisor } from '@/features/supervisors/actions';
import { type UpdateSupervisorSchema, updateSupervisorSchema } from '@/features/supervisors/schemas';
import type { User } from '@/lib/api-contract';

interface EditSupervisorDialogProps {
  supervisor: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSupervisorDialog({ supervisor, open, onOpenChange }: EditSupervisorDialogProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<UpdateSupervisorSchema>({
    resolver: zodResolver(updateSupervisorSchema),
    defaultValues: {
      id: supervisor.id,
      name: supervisor.name,
      email: supervisor.email,
      password: '',
      confirmPassword: '',
    },
  });

  function onSubmit(data: UpdateSupervisorSchema) {
    startTransition(async () => {
      const result = await updateSupervisor(data);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('Supervisor actualizado correctamente.');
        onOpenChange(false);
        form.reset({ id: data.id, name: data.name, email: data.email, password: '', confirmPassword: '' });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Supervisor</DialogTitle>
          <DialogDescription>
            Actualiza los datos del supervisor. Deja la contraseña en blanco para no cambiarla.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nueva Contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar Nueva Contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                Guardar Cambios
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
