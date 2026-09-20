import type React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { theme } from "@/theme";

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export const Input = ({
  label,
  error,
  style,
  ref,
  ...props
}: InputProps & { ref?: React.Ref<React.ComponentRef<typeof TextInput>> }) => (
  <View>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      ref={ref}
      style={[styles.input, error && styles.inputError, style]}
      placeholderTextColor={theme.colors.textTertiary}
      {...props}
    />
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>
);

Input.displayName = "Input";

const styles = StyleSheet.create({
  label: {
    ...theme.typography.subhead,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing["spacing-xs"],
  },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderOutline,
    borderRadius: theme.radius["radius-s"],
    paddingHorizontal: theme.spacing["spacing-l"],
    paddingVertical: theme.spacing["spacing-m"],
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    minHeight: 45,
  },
  inputError: {
    borderColor: theme.colors.accentError,
  },
  error: {
    ...theme.typography.footnote,
    color: theme.colors.accentError,
    marginTop: theme.spacing["spacing-xs"],
  },
});
