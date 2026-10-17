import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { ToastViewport } from '@/components/ui/toast-viewport';
import { ToastProvider } from '@/context/toast-context';
import { theme } from '@/theme';

// React Native needs NetInfo to update TanStack Query's online state.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  }),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
    },
  },
});

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="report"
                  options={{
                    presentation: 'modal',
                    headerShown: true,
                    title: 'Reportar problema',
                    animation: 'slide_from_bottom',
                    headerStyle: {
                      backgroundColor: theme.colors.backgroundPrimary,
                    },
                    headerTitleStyle: theme.typography.headline,
                    headerShadowVisible: false,
                  }}
                />
              </Stack>
              <ToastViewport />
            </GestureHandlerRootView>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
