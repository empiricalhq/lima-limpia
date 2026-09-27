import { ApiStatusMonitor } from '@/components/common/api-status-monitor';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { getAuth, requireUser } from '@/features/auth/lib';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const auth = await getAuth();

  return (
    <>
      <ApiStatusMonitor />
      <div className="min-h-screen bg-background">
        <DashboardSidebar user={user} memberRoles={auth?.roles ?? []} />
        <div className="lg:pl-64">
          <main className="p-6">{children}</main>
        </div>
      </div>
    </>
  );
}
