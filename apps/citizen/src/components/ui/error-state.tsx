import { AlertCircle } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { Button } from './button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, theme.shadow['shadow-soft']]}>
        <AlertCircle size={32} color={theme.colors.accentError} strokeWidth={2} />
      </View>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button title="Reintentar" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing['spacing-l'],
    paddingVertical: theme.spacing['spacing-xxl'],
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: theme.radius['radius-full'],
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
