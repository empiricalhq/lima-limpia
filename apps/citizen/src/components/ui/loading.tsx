import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

interface LoadingProps {
  message?: string;
  size?: 'small' | 'large';
}

export function Loading({ message, size = 'large' }: LoadingProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={theme.colors.textPrimary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing['spacing-m'],
    paddingVertical: theme.spacing['spacing-xxl'],
  },
  message: {
    ...theme.typography.callout,
    color: theme.colors.textSecondary,
  },
});
