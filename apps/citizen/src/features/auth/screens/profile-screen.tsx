import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/context/toast-context';
import { useLocation } from '@/features/map/hooks/use-location';
import { useQuizProgress } from '@/features/quiz/hooks/use-quiz-progress';
import { ApiError } from '@/lib/api';
import { theme } from '@/theme';
import { AuthForm } from '../components/auth-form';
import { useAuth } from '../hooks/use-auth';
import { useUpdateLocation } from '../hooks/use-update-location';

export function ProfileScreen() {
  const { user, isAuthenticated, logout } = useAuth();
  const { show } = useToast();
  const { progress, isLoadingProgress } = useQuizProgress();
  const { isLoading: isLoadingLocation, error: locationError, requestLocation } = useLocation();
  const { mutate: updateLocation, isPending: isUpdatingLocation } = useUpdateLocation();

  const handleUpdateLocation = async () => {
    try {
      const coords = await requestLocation();
      if (coords) {
        updateLocation(coords, {
          onSuccess: () => {
            show('Ubicación actualizada correctamente', { type: 'success' });
          },
          onError: (error) => {
            const message = error instanceof ApiError ? error.message : 'No se pudo guardar tu ubicación.';
            show(message, { type: 'error' });
          },
        });
      }
    } catch {
      if (locationError) {
        show(locationError, { type: 'error' });
      }
    }
  };

  const handleLogout = () => {
    show('¿Estás seguro que quieres cerrar sesión?', {
      type: 'error',
      action: {
        label: 'Confirmar',
        onPress: async () => {
          await logout();
        },
      },
    });
  };

  if (!isAuthenticated) {
    return (
      <Screen>
        <AuthForm />
      </Screen>
    );
  }

  const accuracy =
    progress && progress.totalAnswered > 0 ? Math.round((progress.correctAnswers / progress.totalAnswered) * 100) : 0;

  return (
    <Screen>
      <View style={styles.contentWrapper}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>

        <Card variant="elevated">
          <Text style={styles.cardTitle}>Estadísticas del quiz</Text>
          {isLoadingProgress ? (
            <Loading />
          ) : (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{progress?.streak || 0}</Text>
                <Text style={styles.statLabel}>Racha</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{accuracy}%</Text>
                <Text style={styles.statLabel}>Precisión</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{progress?.totalAnswered || 0}</Text>
                <Text style={styles.statLabel}>Respuestas</Text>
              </View>
            </View>
          )}
        </Card>

        <Button
          title="Actualizar mi ubicación"
          variant="secondary"
          onPress={handleUpdateLocation}
          loading={isLoadingLocation || isUpdatingLocation}
        />

        <Button title="Cerrar sesión" variant="destructive" onPress={handleLogout} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentWrapper: {
    gap: theme.spacing['spacing-xl'],
  },
  title: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
  },
  name: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
  },
  email: {
    ...theme.typography.callout,
    color: theme.colors.textSecondary,
    marginTop: -theme.spacing['spacing-m'],
  },
  cardTitle: {
    ...theme.typography.title3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing['spacing-l'],
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
  },
  statLabel: {
    ...theme.typography.caption,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing['spacing-xs'],
  },
});
