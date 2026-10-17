import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LocationCoords } from '@/types';

export function useUpdateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (coords: LocationCoords) => api.updateProfileLocation(coords),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truck-status'] });
    },
  });
}
