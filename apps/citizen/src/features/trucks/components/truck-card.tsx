import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { theme } from '@/theme';
import type { TruckStatus } from '@/types';

interface TruckCardProps {
  status: TruckStatus;
}

export function TruckCard({ status }: TruckCardProps) {
  if (status.status === 'NOT_SCHEDULED' || status.status === 'LOCATION_NOT_SET') {
    return (
      <Card variant="elevated">
        <Text style={styles.sectionTitle}>Recolección de basura</Text>
        <Text style={styles.message}>{status.message}</Text>
      </Card>
    );
  }

  let subtitle: string;
  let etaDisplay: React.ReactNode;

  if (status.status === 'ON_THE_WAY') {
    subtitle = 'En camino a tu ubicación';
    etaDisplay = (
      <>
        <Text style={styles.etaValue}>{status.etaMinutes}</Text>
        <Text style={styles.etaLabel}>min</Text>
      </>
    );
  } else {
    subtitle = 'El camión está llegando';
    etaDisplay = <Text style={styles.etaValueNow}>AHORA</Text>;
  }

  return (
    <Card variant="elevated">
      <Text style={styles.sectionTitle}>Camión cercano</Text>
      <View style={styles.row}>
        <View style={styles.content}>
          <Text style={styles.type}>{status.truckName}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.eta}>{etaDisplay}</View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing['spacing-s'],
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['spacing-m'],
  },
  content: {
    flex: 1,
  },
  type: {
    ...theme.typography.headline,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  message: {
    ...theme.typography.callout,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  eta: {
    alignItems: 'flex-end',
  },
  etaValue: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
  },
  etaValueNow: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
  },
  etaLabel: {
    ...theme.typography.caption,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    marginTop: -theme.spacing['spacing-xs'],
  },
});
