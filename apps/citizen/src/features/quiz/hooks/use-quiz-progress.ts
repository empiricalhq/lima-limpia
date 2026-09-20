import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { quizQuestions } from "@/features/quiz/data/quiz-questions";
import { storage } from "@/lib/storage";
import type { QuizProgress } from "@/types";

function calculateDaysDifference(
  lastPlayed: string | null,
  today: string,
): number {
  if (!lastPlayed) {
    return -1;
  }

  const last = new Date(lastPlayed);
  const current = new Date(today);

  last.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);

  const diffTime = current.getTime() - last.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function useQuizProgress() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["quizProgress"],
    queryFn: () => storage.getQuizProgress(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const mutation = useMutation({
    mutationFn: async (finalScore: number): Promise<QuizProgress> => {
      const currentProgress =
        queryClient.getQueryData<QuizProgress>(["quizProgress"]) ??
        (await storage.getQuizProgress());

      const [today] = new Date().toISOString().split("T");

      if (currentProgress.lastPlayed === today) {
        const newProgress: QuizProgress = {
          ...currentProgress,
          totalAnswered: currentProgress.totalAnswered + quizQuestions.length,
          correctAnswers: currentProgress.correctAnswers + finalScore,
        };
        await storage.setQuizProgress(newProgress);
        return newProgress;
      }

      const daysSinceLastPlayed = calculateDaysDifference(
        currentProgress.lastPlayed,
        today,
      );

      let newStreak: number;
      if (daysSinceLastPlayed === 1) {
        newStreak = currentProgress.streak + 1;
      } else {
        newStreak = 1;
      }

      const newProgress: QuizProgress = {
        streak: newStreak,
        totalAnswered: currentProgress.totalAnswered + quizQuestions.length,
        correctAnswers: currentProgress.correctAnswers + finalScore,
        lastPlayed: today,
      };

      await storage.setQuizProgress(newProgress);
      return newProgress;
    },
    onSuccess: (newProgress) => {
      queryClient.setQueryData(["quizProgress"], newProgress);
    },
    onError: (error) => {
      console.error("Failed to save quiz progress:", error);
    },
  });

  return {
    progress: query.data,
    isLoadingProgress: query.isLoading,
    updateProgress: mutation.mutateAsync,
    isUpdatingProgress: mutation.isPending,
  };
}
