import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FastSquircleView from 'react-native-fast-squircle';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorState } from '@/components/ui/error-state';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/context/toast-context';
import { useLocation } from '@/features/map/hooks/use-location';
import { useTrucks } from '@/features/trucks/hooks/use-trucks';
import { theme } from '@/theme';
import { TruckMap } from '../components/truck-map';

export function MapScreen() {
  const { data: trucks = [], isLoading: isLoadingTrucks, error, refetch } = useTrucks();
  const { coords: userLocation, isLoading: isLoadingLocation } = useLocation({
    fetchOnMount: true,
  });
  const { show } = useToast();

  useEffect(() => {
    if (!isLoadingTrucks && trucks.length === 0) {
      show('No hay camiones en servicio en este momento.', {
        type: 'info',
        duration: 5000,
      });
    }
  }, [isLoadingTrucks, trucks.length, show]);

  if (isLoadingTrucks || isLoadingLocation) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Loading message="Cargando mapa..." />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ErrorState message="No se pudo cargar el mapa. Verifica tu conexión." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <TruckMap trucks={trucks} userLocation={userLocation} />

      {trucks.length > 0 && (
        <SafeAreaView style={styles.badgeContainerTop} edges={['top']}>
          <FastSquircleView style={[styles.badge, theme.shadow['shadow-soft']]} cornerSmoothing={1}>
            <Text style={styles.badgeText}>
              {trucks.length} {trucks.length > 1 ? 'CAMIONES' : 'CAMIÓN'} EN SERVICIO
            </Text>
          </FastSquircleView>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing['spacing-xxl'],
    backgroundColor: theme.colors.backgroundPrimary,
  },
  badgeContainerTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: theme.spacing['spacing-l'],
    pointerEvents: 'none',
  },
  badge: {
    backgroundColor: theme.colors.backgroundPrimary,
    paddingVertical: theme.spacing['spacing-s'],
    paddingHorizontal: theme.spacing['spacing-l'],
    borderRadius: theme.radius['radius-full'],
    marginTop: theme.spacing['spacing-s'],
  },
  badgeText: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
  },
});
