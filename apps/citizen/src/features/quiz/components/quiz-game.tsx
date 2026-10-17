import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WASTE_TYPES } from '@/constants';
import { theme } from '@/theme';
import type { QuizQuestion, WasteType } from '@/types';

interface QuizGameProps {
  questions: QuizQuestion[];
  onComplete: (score: number) => void;
}

export function QuizGame({ questions, onComplete }: QuizGameProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<WasteType | null>(null);
  const [score, setScore] = useState(0);

  const question = questions[currentIndex];
  const isAnswered = selectedAnswer !== null;
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleAnswer = (answer: WasteType) => {
    setSelectedAnswer(answer);
    if (answer === question.correctAnswer) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (isLastQuestion) {
      onComplete(score);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.progress}>
        Pregunta {currentIndex + 1} de {questions.length}
      </Text>

      <Image source={{ uri: question.imageUrl }} style={styles.image} />

      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>¿Dónde va esto?</Text>
        <Text style={styles.item}>{question.item}</Text>
      </View>

      <View style={styles.options}>
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option;
          const isCorrect = isAnswered && option === question.correctAnswer;
          const isWrong = isAnswered && isSelected && !isCorrect;

          return (
            <Pressable key={option} onPress={() => !isAnswered && handleAnswer(option)} disabled={isAnswered}>
              <Card
                style={[
                  styles.option,
                  isCorrect && styles.correctOption,
                  isWrong && styles.wrongOption,
                  isAnswered && !isCorrect && styles.disabledOption,
                ]}
                variant="outline"
              >
                <Text style={styles.optionText}>{WASTE_TYPES[option].label}</Text>
              </Card>
            </Pressable>
          );
        })}
      </View>

      {isAnswered && (
        <View style={styles.footer}>
          <Button title={isLastQuestion ? 'Ver resultados' : 'Siguiente'} onPress={handleNext} fullWidth={true} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: theme.spacing['spacing-l'],
  },
  progress: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: theme.radius['radius-xl'],
    backgroundColor: theme.colors.backgroundSecondary,
  },
  questionContainer: {
    alignItems: 'center',
    gap: theme.spacing['spacing-xs'],
  },
  questionText: {
    ...theme.typography.callout,
    color: theme.colors.textSecondary,
  },
  item: {
    ...theme.typography.title1,
    color: theme.colors.textPrimary,
  },
  options: {
    gap: theme.spacing['spacing-m'],
    marginTop: theme.spacing['spacing-m'],
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  correctOption: {
    backgroundColor: theme.colors.accentIncome,
    borderColor: theme.colors.accentIncome,
  },
  wrongOption: {
    backgroundColor: theme.colors.accentBudgetRed,
    borderColor: theme.colors.accentBudgetRed,
  },
  disabledOption: {
    opacity: 0.5,
  },
  footer: {
    marginTop: 'auto',
    paddingBottom: theme.spacing['spacing-l'],
  },
});
