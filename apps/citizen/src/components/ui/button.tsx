import {
  ActivityIndicator,
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
} from 'react-native';
import FastSquircleView from 'react-native-fast-squircle';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '@/theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  loading?: boolean;
  fullWidth?: boolean;
}

const AnimatedSquircle = Animated.createAnimatedComponent(FastSquircleView);

export function Button({
  title,
  variant = 'primary',
  loading,
  fullWidth,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!isDisabled) {
      scale.value = withTiming(0.6, {
        duration: theme.animation.duration.medium,
      });
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withTiming(1, { duration: theme.animation.duration.medium });
    onPressOut?.(e);
  };

  return (
    <Pressable disabled={isDisabled} onPressIn={handlePressIn} onPressOut={handlePressOut} {...props}>
      <AnimatedSquircle
        style={[
          styles.base,
          styles[variant],
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
          animatedStyle,
        ]}
        cornerSmoothing={1}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              variant === 'primary' || variant === 'destructive' ? theme.colors.textOnDark : theme.colors.textPrimary
            }
          />
        ) : (
          <Text style={[styles.text, styles[`${variant}Text`]]}>{title}</Text>
        )}
      </AnimatedSquircle>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: theme.sizing['sizing-button-lg'],
    borderRadius: theme.radius['radius-s'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing['spacing-l'],
  },
  primary: {
    backgroundColor: theme.colors.backgroundDark,
  },
  secondary: {
    backgroundColor: theme.colors.backgroundSecondary,
  },
  destructive: {
    backgroundColor: theme.colors.accentError,
  },
  ghost: {
    backgroundColor: 'transparent',
    height: 'auto',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    ...theme.typography.title3,
  },
  primaryText: {
    color: theme.colors.textOnDark,
  },
  secondaryText: {
    color: theme.colors.textPrimary,
  },
  destructiveText: {
    color: theme.colors.textOnDark,
  },
  ghostText: {
    color: theme.colors.textSecondary,
    ...theme.typography.callout,
  },
});
