import { useQuery } from '@tanstack/react-query';
import { POLLING } from '@/constants';
import { useAppState } from '@/hooks/use-app-state';
import { api } from '@/lib/api';

export function useTrucks(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const isAppActive = useAppState();

  return useQuery({
    queryKey: ['trucks'],
    queryFn: () => api.getTrucks(),
    refetchInterval: isAppActive && enabled ? POLLING.TRUCKS : false,
    staleTime: POLLING.TRUCKS,
    placeholderData: (previousData) => previousData,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
  });
}
