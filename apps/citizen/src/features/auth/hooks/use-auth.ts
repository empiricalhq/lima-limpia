import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LoginInput, SignUpInput } from '@/types';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const storedUser = await api.getStoredUser();
      if (!storedUser) {
        return null;
      }

      // Secure storage restores a local hint. The API session is authoritative.
      try {
        const validatedUser = await api.validateSession();
        return validatedUser;
      } catch (error) {
        // Do not trust stored credentials when session validation fails.
        console.warn('Session validation failed. Forcing logout.', error);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
    onSuccess: (loggedInUser) => {
      queryClient.setQueryData(['user'], loggedInUser);
    },
    onError: () => {
      queryClient.setQueryData(['user'], null);
    },
  });

  const signUpMutation = useMutation({
    mutationFn: (input: SignUpInput) => api.signUp(input),
    onSuccess: (registeredUser) => {
      queryClient.setQueryData(['user'], registeredUser);
    },
    onError: () => {
      queryClient.setQueryData(['user'], null);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(['user'], null);
      queryClient.clear();
    },
  });

  return {
    user: user || null,
    isLoading,
    isAuthenticated: Boolean(user),
    login: loginMutation.mutateAsync,
    signUp: signUpMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isAuthLoading: loginMutation.isPending || signUpMutation.isPending || logoutMutation.isPending,
  };
}
