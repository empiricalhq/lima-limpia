'use client';

import { Bell, LayoutDashboard, Leaf, LogOut, type LucideIcon, MapPin, Settings, Truck, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/features/auth/actions';
import type { User } from '@/lib/api-contract';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles?: ('admin' | 'owner')[];
}

const navigation: NavItem[] = [
  { name: 'Inicio', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Conductores', href: '/drivers', icon: Users },
  { name: 'Rutas', href: '/routes', icon: MapPin },
  { name: 'Vehículos', href: '/trucks', icon: Truck },
];

const adminNavigation: NavItem[] = [
  { name: 'Configuración', href: '/settings', icon: Settings, roles: ['admin', 'owner'] },
];

function UserInfo({ user }: { user: User }) {
  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center justify-between">
      <DropdownMenu>
        <DropdownMenuTrigger asChild={true}>
          <Button variant="ghost" className="flex items-center justify-start space-x-3 p-2 h-auto cursor-pointer">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
              <span className="text-primary font-medium">{user.name?.[0].toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-muted-foreground truncate text-xs">{user.email}</p>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" className="relative h-8 w-8 shrink-0 cursor-pointer">
        <Bell className="h-5 w-5" />
      </Button>
    </div>
  );
}

interface DashboardSidebarProps {
  user: User;
  memberRole: string | null;
}

export function DashboardSidebar({ user, memberRole }: DashboardSidebarProps) {
  const pathname = usePathname();
  const allNavItems = [...navigation, ...adminNavigation];
  const navItems = allNavItems.filter(
    (item) => !item.roles || (memberRole && item.roles.includes(memberRole as 'admin' | 'owner')),
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
            <Leaf className="text-primary h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold">Lima Limpia</h1>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-4">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <item.icon className="mr-3 h-5 w-5" />
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="border-t p-4">
        <UserInfo user={user} />
      </div>
    </div>
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-background lg:block">{sidebarContent}</aside>
  );
}
