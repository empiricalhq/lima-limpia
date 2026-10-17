import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { theme } from '@/theme';

interface LearnMenuProps {
  onStart: () => void;
}

export function LearnMenu({ onStart }: LearnMenuProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aprende a reciclar</Text>
      <Text style={styles.description}>
        Pon a prueba tus conocimientos y aprende a clasificar diferentes tipos de residuos correctamente.
      </Text>
      <Button title="Comenzar quiz" onPress={onStart} fullWidth={true} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing['spacing-l'],
  },
  title: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing['spacing-xl'],
  },
});
