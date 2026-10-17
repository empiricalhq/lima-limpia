import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Screen } from '@/components/ui/screen';
import { SkeletonTruckCard } from '@/components/ui/skeleton';
import { useTruckStatus } from '@/features/trucks/hooks/use-truck-status';
import { theme } from '@/theme';
import { TruckCard } from '../components/truck-card';

export function HomeScreen() {
  const router = useRouter();
  const { data: status, isLoading, error, refetch, isRefetching } = useTruckStatus();

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.contentWrapper}>
          <SkeletonTruckCard />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <ErrorState message="No se pudo cargar la información. Verifica tu conexión." onRetry={refetch} />
        </View>
      );
    }

    return (
      <View style={styles.contentWrapper}>
        {status ? <TruckCard status={status} /> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reportar un problema</Text>
          <Text style={styles.sectionDescription}>
            Informa sobre recolecciones perdidas, vertidos ilegales o problemas con la basura en tu zona.
          </Text>
          <Button title="Crear reporte" onPress={() => router.push('/report')} variant="secondary" fullWidth={true} />
        </View>
      </View>
    );
  };

  return (
    <Screen isRefreshing={isRefetching} onRefresh={refetch}>
      <Text style={styles.title}>Lima Limpia</Text>
      {renderContent()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentWrapper: {
    gap: theme.spacing['spacing-xxl'],
  },
  title: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing['spacing-l'],
  },
  errorContainer: {
    paddingVertical: theme.spacing['spacing-xxl'],
  },
  section: {
    gap: theme.spacing['spacing-s'],
  },
  sectionTitle: {
    ...theme.typography.title3,
    color: theme.colors.textPrimary,
  },
  sectionDescription: {
    ...theme.typography.callout,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing['spacing-m'],
    lineHeight: 22,
  },
});
