import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePulsingAnimation } from '@/hooks/use-pulsing-animation';
import { theme } from '@/theme';

export function SkeletonTruckCard() {
  const animatedStyle = usePulsingAnimation();

  return (
    <View style={[styles.skeleton, styles.truckCard]}>
      <View style={styles.row}>
        <Animated.View style={[styles.dot, animatedStyle]} />
        <View style={styles.content}>
          <Animated.View style={[styles.line, animatedStyle]} />
          <Animated.View style={[styles.line, styles.lineShort, animatedStyle]} />
        </View>
        <Animated.View style={[styles.eta, animatedStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius['radius-m'],
    padding: theme.spacing['spacing-l'],
    marginBottom: theme.spacing['spacing-m'],
  },
  line: {
    height: 16,
    backgroundColor: theme.colors.backgroundTertiary,
    borderRadius: theme.radius['radius-xs'],
    marginBottom: theme.spacing['spacing-s'],
  },
  lineShort: {
    width: '60%',
  },
  truckCard: {
    borderWidth: 1,
    borderColor: theme.colors.borderOutline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['spacing-m'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius['radius-full'],
    backgroundColor: theme.colors.backgroundTertiary,
  },
  content: {
    flex: 1,
  },
  eta: {
    width: 40,
    height: 40,
    borderRadius: theme.radius['radius-s'],
    backgroundColor: theme.colors.backgroundTertiary,
  },
});
