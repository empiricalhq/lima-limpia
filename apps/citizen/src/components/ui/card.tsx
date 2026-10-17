import { StyleSheet, type ViewProps } from 'react-native';
import FastSquircleView from 'react-native-fast-squircle';
import { theme } from '@/theme';

interface CardProps extends ViewProps {
  variant?: 'outline' | 'elevated';
}

export function Card({ variant = 'outline', children, style, ...props }: CardProps) {
  return (
    <FastSquircleView style={[styles.card, styles[variant], style]} cornerSmoothing={0.8} {...props}>
      {children}
    </FastSquircleView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius['radius-m'],
    padding: theme.spacing['spacing-l'],
  },
  outline: {
    borderWidth: 1,
    borderColor: theme.colors.borderOutline,
  },
  elevated: {
    ...theme.shadow['shadow-soft'],
    backgroundColor: theme.colors.backgroundPrimary,
  },
});
