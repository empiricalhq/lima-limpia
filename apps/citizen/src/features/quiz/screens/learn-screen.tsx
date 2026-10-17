import { useState } from 'react';
import { Screen } from '@/components/ui/screen';
import { LearnMenu } from '../components/learn-menu';
import { QuizGame } from '../components/quiz-game';
import { QuizResults } from '../components/quiz-results';
import { quizQuestions } from '../data/quiz-questions';
import { useQuizProgress } from '../hooks/use-quiz-progress';

type ScreenState = 'menu' | 'quiz' | 'results';

export function LearnScreen() {
  const { progress, updateProgress } = useQuizProgress();
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [score, setScore] = useState(0);
  const [streakIncreased, setStreakIncreased] = useState(false);

  const handleQuizComplete = async (finalScore: number) => {
    setScore(finalScore);
    const oldStreak = progress?.streak || 0;
    const newProgress = await updateProgress(finalScore);
    setStreakIncreased(newProgress.streak > oldStreak);
    setScreen('results');
  };

  const handleRestart = () => {
    setScreen('menu');
    setStreakIncreased(false);
  };

  const renderScreen = () => {
    switch (screen) {
      case 'quiz':
        return <QuizGame questions={quizQuestions} onComplete={handleQuizComplete} />;
      case 'results':
        return <QuizResults score={score} onRestart={handleRestart} streakIncreased={streakIncreased} />;
      default:
        return <LearnMenu onStart={() => setScreen('quiz')} />;
    }
  };

  return <Screen key={screen}>{renderScreen()}</Screen>;
}
