import { AppleMaps, GoogleMaps } from 'expo-maps';
import { memo, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { DEFAULT_MAP_CENTER } from '@/constants';
import { theme } from '@/theme';
import type { LocationCoords, Truck } from '@/types';

interface TruckMapProps {
  trucks: Truck[];
  userLocation?: LocationCoords | null;
}

function TruckMapComponent({ trucks, userLocation }: TruckMapProps) {
  const MapComponent = Platform.OS === 'ios' ? AppleMaps.View : GoogleMaps.View;

  const userLat = userLocation?.latitude;
  const userLng = userLocation?.longitude;

  const camera = useMemo(() => {
    if (userLat !== undefined && userLng !== undefined) {
      return {
        coordinates: { latitude: userLat, longitude: userLng },
        zoom: 13,
      };
    }
    return DEFAULT_MAP_CENTER;
  }, [userLat, userLng]);

  const markers = useMemo(
    () =>
      trucks.map((truck) => ({
        key: truck.id,
        coordinates: { latitude: truck.lat, longitude: truck.lng },
        title: truck.name,
        snippet: `Placa: ${truck.licensePlate}`,
      })),
    [trucks],
  );

  return (
    <View style={styles.container}>
      <MapComponent
        style={styles.map}
        cameraPosition={camera}
        {...(Platform.OS === 'ios' ? { annotations: markers } : { markers })}
        properties={{ isMyLocationEnabled: Boolean(userLocation) }}
        uiSettings={{ myLocationButtonEnabled: Boolean(userLocation) }}
      />
    </View>
  );
}

const LOCATION_EPSILON = 1e-6; // Ignore GPS changes smaller than this threshold.

export const TruckMap = memo(TruckMapComponent, (prevProps, nextProps) => {
  const isUserLocationSame =
    !(prevProps.userLocation || nextProps.userLocation) ||
    (prevProps.userLocation &&
      nextProps.userLocation &&
      Math.abs(prevProps.userLocation.latitude - nextProps.userLocation.latitude) < LOCATION_EPSILON &&
      Math.abs(prevProps.userLocation.longitude - nextProps.userLocation.longitude) < LOCATION_EPSILON);

  if (!isUserLocationSame) {
    return false;
  }

  if (prevProps.trucks.length !== nextProps.trucks.length) {
    return false;
  }

  const prevTrucksMap = new Map(prevProps.trucks.map((truck) => [truck.id, truck]));

  const areTrucksSame = nextProps.trucks.every((nextTruck) => {
    const prevTruck = prevTrucksMap.get(nextTruck.id);
    if (!prevTruck) {
      return false;
    }
    return prevTruck.lat === nextTruck.lat && prevTruck.lng === nextTruck.lng;
  });

  return areTrucksSame;
});

TruckMap.displayName = 'TruckMap';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  map: {
    flex: 1,
  },
});
