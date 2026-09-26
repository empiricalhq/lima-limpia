'use client';

import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { EditSupervisorDialog } from '@/components/supervisors/edit-supervisor-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { User } from '@/lib/api-contract';

export function SupervisorActions({ supervisor }: { supervisor: User }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild={true}>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsEditing(true)}>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditSupervisorDialog supervisor={supervisor} open={isEditing} onOpenChange={setIsEditing} />
    </>
  );
}
