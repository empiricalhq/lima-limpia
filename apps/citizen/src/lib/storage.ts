import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import type { QuizProgress, User } from "@/types";

const KEYS = {
  USER: "user",
  QUIZ_PROGRESS: "quiz_progress",
} as const;

class Storage {
  private async set(key: string, value: unknown): Promise<void> {
    await setItemAsync(key, JSON.stringify(value));
  }

  private async get<T>(key: string): Promise<T | null> {
    const value = await getItemAsync(key);
    if (value === null) {
      return null;
    }
    return JSON.parse(value) as T;
  }

  private async delete(key: string): Promise<void> {
    await deleteItemAsync(key);
  }

  async getUser(): Promise<User | null> {
    try {
      const parsed = await this.get<User>(KEYS.USER);
      if (!parsed) {
        return null;
      }

      if (!(parsed.id && parsed.email && parsed.name)) {
        console.warn("Invalid user structure, clearing");
        await this.delete(KEYS.USER);
        return null;
      }

      return parsed;
    } catch (error) {
      console.error("Failed to get user from storage", error);
      await this.delete(KEYS.USER);
      return null;
    }
  }

  async setUser(user: User): Promise<void> {
    try {
      await this.set(KEYS.USER, user);
    } catch (error) {
      console.error("Failed to set user in storage", error);
      throw new Error("No se pudo guardar el usuario", { cause: error });
    }
  }

  async clearAuth(): Promise<void> {
    try {
      await this.delete(KEYS.USER);
    } catch (error) {
      console.error("Failed to clear auth from storage", error);
    }
  }

  async getQuizProgress(): Promise<QuizProgress> {
    const defaultValue: QuizProgress = {
      streak: 0,
      totalAnswered: 0,
      correctAnswers: 0,
      lastPlayed: null,
    };

    try {
      const parsed = await this.get<QuizProgress>(KEYS.QUIZ_PROGRESS);
      if (!parsed) {
        return defaultValue;
      }

      if (
        typeof parsed.streak !== "number" ||
        typeof parsed.totalAnswered !== "number" ||
        typeof parsed.correctAnswers !== "number"
      ) {
        console.warn(
          "Invalid quiz progress structure, returning default value.",
        );
        return defaultValue;
      }

      return parsed;
    } catch (error) {
      console.error(
        "CRITICAL: Failed to get quiz progress from storage. User data was NOT reset.",
        error,
      );
      return defaultValue;
    }
  }

  async setQuizProgress(progress: QuizProgress): Promise<void> {
    try {
      await this.set(KEYS.QUIZ_PROGRESS, progress);
    } catch (error) {
      console.error("Failed to set quiz progress in storage", error);
      throw new Error("No se pudo guardar el progreso", { cause: error });
    }
  }

  async clearAllData(): Promise<void> {
    try {
      await Promise.all([this.clearAuth(), this.delete(KEYS.QUIZ_PROGRESS)]);
    } catch (error) {
      console.error("Failed to clear all data", error);
    }
  }
}

export const storage = new Storage();
