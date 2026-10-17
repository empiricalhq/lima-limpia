import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TOAST_CONFIG } from '@/constants';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  duration?: number;
  type?: ToastType;
  action?: ToastAction;
}

export interface Toast {
  id: string;
  content: string;
  options: Required<Omit<ToastOptions, 'action'>> & {
    action: ToastAction | null;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  show: (content: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_OPTIONS: Required<Omit<ToastOptions, 'action'>> & {
  action: ToastAction | null;
} = {
  duration: TOAST_CONFIG.DEFAULT_DURATION,
  type: 'info',
  action: null,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }

    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (content: string, options?: ToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const toastOptions = {
        ...DEFAULT_OPTIONS,
        ...options,
        action: options?.action || null,
      };
      const toast: Toast = { id, content, options: toastOptions };

      setToasts((prev) => {
        const newToasts = [...prev, toast];
        if (newToasts.length > TOAST_CONFIG.MAX_VISIBLE_TOASTS) {
          const removedId = newToasts[0].id;
          if (timersRef.current.has(removedId)) {
            clearTimeout(timersRef.current.get(removedId));
            timersRef.current.delete(removedId);
          }
          return newToasts.slice(1);
        }
        return newToasts;
      });

      if (toastOptions.duration > 0) {
        const timer = setTimeout(() => {
          dismiss(id);
        }, toastOptions.duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  return <ToastContext.Provider value={{ toasts, show, dismiss }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
