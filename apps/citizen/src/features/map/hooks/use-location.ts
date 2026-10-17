import {
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  LocationAccuracy,
  requestForegroundPermissionsAsync,
} from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import type { LocationCoords } from '@/types';

interface UseLocationOptions {
  fetchOnMount?: boolean;
}

export function useLocation(options: UseLocationOptions = {}) {
  const { fetchOnMount = false } = options;

  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [isLoading, setIsLoading] = useState(fetchOnMount);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async (): Promise<LocationCoords> => {
    setIsLoading(true);
    setError(null);

    try {
      let permission = await getForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        if (permission.canAskAgain) {
          Alert.alert(
            'Permiso de ubicación',
            'La aplicación necesita tu ubicación para reportar problemas y mostrar camiones cercanos.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Permitir',
                onPress: async () => {
                  permission = await requestForegroundPermissionsAsync();
                  if (permission.status !== 'granted') {
                    throw new Error('Permiso de ubicación denegado.');
                  }
                },
              },
            ],
          );
        } else {
          Alert.alert(
            'Habilitar ubicación',
            'El permiso de ubicación fue denegado. Por favor, habilítalo en los ajustes de la aplicación para continuar.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
            ],
          );
          throw new Error('Permiso de ubicación denegado permanentemente.');
        }
      }

      const location = await getCurrentPositionAsync({
        accuracy: LocationAccuracy.Balanced,
      });

      const newCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setCoords(newCoords);
      return newCoords;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo obtener la ubicación';
      setError(message);
      setCoords(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchOnMount) {
      requestLocation().catch((err) => {
        console.error('Failed to fetch location on mount:', err);
      });
    }
  }, [fetchOnMount, requestLocation]);

  const clearLocation = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  return {
    coords,
    isLoading,
    error,
    requestLocation,
    clearLocation,
  };
}
