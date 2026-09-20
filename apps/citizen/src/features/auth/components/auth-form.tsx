import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { theme } from "@/theme";

const baseSchema = z.object({
  email: z.email("Correo electrónico inválido"),
});

const signupSchema = baseSchema.extend({
  name: z.string().min(2, "El nombre es obligatorio"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const loginSchema = baseSchema.extend({
  password: z.string().min(1, "La contraseña es obligatoria"),
});

interface FormData {
  name?: string;
  email: string;
  password: string;
}

const DEFAULT_VALUES = {
  login: { name: "", email: "", password: "" },
  signup: { name: "", email: "", password: "" },
} as const;

interface AuthFormProps {
  onSuccess?: () => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const { login, signUp } = useAuth();
  const { show } = useToast();
  const [mode, setMode] = useState<"login" | "signup">("login");

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(mode === "login" ? loginSchema : signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  useEffect(() => {
    reset(DEFAULT_VALUES[mode]);
  }, [mode, reset]);

  const handleAuth = async (data: FormData) => {
    try {
      if (mode === "login") {
        await login({ email: data.email, password: data.password });
      } else {
        await signUp({
          // biome-ignore lint/style/noNonNullAssertion: zod guarantees that data.name is a valid string if we reach this point
          name: data.name!,
          email: data.email,
          password: data.password,
        });
      }
      onSuccess?.();
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        show(error.message, { type: "error" });
      } else {
        show("Ocurrió un error inesperado. Por favor, intenta de nuevo.", {
          type: "error",
        });
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
      </Text>
      <Text style={styles.description}>
        {mode === "login"
          ? "Inicia sesión para reportar problemas y ver tu progreso."
          : "Crea una cuenta para acceder a todas las funciones."}
      </Text>

      {mode === "signup" && (
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Nombre"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.name?.message}
            />
          )}
        />
      )}
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Correo electrónico"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Contraseña"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.password?.message}
            secureTextEntry={true}
          />
        )}
      />

      <Button
        title={mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        onPress={() => handleSubmit(handleAuth)()}
        loading={isSubmitting}
        fullWidth={true}
      />
      <Button
        title={
          mode === "login"
            ? "¿No tienes cuenta? Regístrate"
            : "¿Ya tienes cuenta? Inicia sesión"
        }
        variant="ghost"
        onPress={() => setMode((m) => (m === "login" ? "signup" : "login"))}
        disabled={isSubmitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing["spacing-xl"],
  },
  title: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
});
