import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { quizQuestions } from '@/features/quiz/data/quiz-questions';
import { theme } from '@/theme';

interface QuizResultsProps {
  score: number;
  onRestart: () => void;
  streakIncreased: boolean;
}

export function QuizResults({ score, onRestart, streakIncreased }: QuizResultsProps) {
  const percentage = Math.round((score / quizQuestions.length) * 100);

  const getMessage = () => {
    if (percentage === 100) {
      return '¡Perfecto!';
    }
    if (percentage >= 80) {
      return '¡Excelente trabajo!';
    }
    if (percentage >= 60) {
      return '¡Buen trabajo!';
    }
    return 'Sigue practicando';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quiz completado</Text>
      <View style={[styles.scoreCircle, theme.shadow['shadow-strong']]}>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.scoreTotal}>/ {quizQuestions.length}</Text>
      </View>
      <Text style={styles.percentage}>{getMessage()}</Text>
      {streakIncreased ? (
        <View style={styles.streakBadge}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={styles.streakText}>¡Racha activa!</Text>
        </View>
      ) : null}
      <Button title="Jugar de nuevo" onPress={onRestart} fullWidth={true} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing['spacing-l'],
  },
  title: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
  },
  scoreCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 8,
    borderColor: theme.colors.accentIncome,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    ...theme.typography.display,
    fontSize: 72,
    color: theme.colors.textPrimary,
  },
  scoreTotal: {
    ...theme.typography.title2,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing['spacing-xs'],
  },
  percentage: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['spacing-s'],
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: theme.spacing['spacing-l'],
    paddingVertical: theme.spacing['spacing-s'],
    borderRadius: theme.radius['radius-full'],
  },
  streakEmoji: {
    fontSize: 20,
  },
  streakText: {
    ...theme.typography.subhead,
    color: theme.colors.textPrimary,
  },
});
