import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REPORT_TYPES } from "@/constants";
import { useToast } from "@/context/toast-context";
import { useLocation } from "@/features/map/hooks/use-location";
import { theme } from "@/theme";
import type { CreateReportInput } from "@/types";

interface ReportFormProps {
  onSubmit: (data: CreateReportInput) => void;
  isSubmitting: boolean;
}

const reportSchema = z.object({
  description: z
    .string()
    .min(10, "Describe el problema con más detalle (mín. 10 caracteres)"),
});

type FormData = z.infer<typeof reportSchema>;

export function ReportForm({ onSubmit, isSubmitting }: ReportFormProps) {
  const [type, setType] = useState<CreateReportInput["type"] | null>(null);
  const {
    coords,
    isLoading: isLoadingLocation,
    error: locationError,
    requestLocation,
  } = useLocation();
  const { show } = useToast();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(reportSchema),
    mode: "onChange",
    defaultValues: { description: "" },
  });

  const handleFormSubmit = async (data: FormData) => {
    if (!type) {
      show("Selecciona un tipo de reporte", { type: "error" });
      return;
    }

    let location = coords;
    if (!location) {
      try {
        location = await requestLocation();
      } catch {
        show("Se necesita la ubicación para enviar el reporte", {
          type: "error",
        });
        return;
      }
    }

    onSubmit({
      type,
      description: data.description.trim(),
      latitude: location.latitude,
      longitude: location.longitude,
    });
  };

  if (!type) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Tipo de reporte</Text>
        <Text style={styles.description}>
          Selecciona el tipo de problema que quieres reportar.
        </Text>
        <View style={styles.types}>
          {(
            Object.entries(REPORT_TYPES) as [
              CreateReportInput["type"],
              string,
            ][]
          ).map(([key, label]) => (
            <Button
              key={key}
              title={label}
              variant="secondary"
              onPress={() => setType(key)}
              fullWidth={true}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Detalles del reporte</Text>

      <Input label="Tipo" value={REPORT_TYPES[type]} editable={false} />

      <Controller
        control={control}
        name="description"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Descripción"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="Describe el problema..."
            multiline={true}
            style={styles.textArea}
            error={errors.description?.message}
          />
        )}
      />

      <View>
        <Button
          title={coords ? "Ubicación obtenida" : "Obtener mi ubicación"}
          variant="secondary"
          onPress={requestLocation}
          loading={isLoadingLocation}
          disabled={isLoadingLocation || Boolean(coords)}
          fullWidth={true}
        />
        {locationError ? (
          <Text style={styles.error}>{locationError}</Text>
        ) : null}
        {coords ? (
          <Text style={styles.success}>
            Ubicación: {coords.latitude.toFixed(4)},{" "}
            {coords.longitude.toFixed(4)}
          </Text>
        ) : null}
      </View>

      <Button
        title="Enviar reporte"
        onPress={() => handleSubmit(handleFormSubmit)()}
        loading={isSubmitting}
        disabled={!isValid || isSubmitting}
        fullWidth={true}
      />

      <Button
        title="Cambiar tipo de reporte"
        variant="ghost"
        onPress={() => setType(null)}
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
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
  },
  description: {
    ...theme.typography.callout,
    color: theme.colors.textSecondary,
    marginTop: -theme.spacing["spacing-s"],
  },
  types: {
    gap: theme.spacing["spacing-m"],
    marginTop: theme.spacing["spacing-s"],
  },
  textArea: {
    height: 120,
    textAlignVertical: "top",
  },
  error: {
    ...theme.typography.footnote,
    color: theme.colors.accentError,
    marginTop: theme.spacing["spacing-xs"],
  },
  success: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing["spacing-xs"],
  },
});
