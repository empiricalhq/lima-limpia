import type * as React from 'react';
import { cn } from '@/lib/utils';

const TONE_STYLES = {
  success: 'bg-green-100 text-green-600',
  error: 'bg-red-100 text-red-600',
} as const;

const TONE_ICONS = {
  success: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  error:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
} as const;

interface AuthStatusProps {
  tone: keyof typeof TONE_STYLES;
  /** Accessible name for the icon: the outcome stated in words. */
  label: string;
  title: string;
  description: string;
  /** Whatever the reader can do next, if anything. */
  children?: React.ReactNode;
}

/** Outcome screen for an auth flow. Server-renderable: no state, no animation. */
export function AuthStatus({ tone, label, title, description, children }: AuthStatusProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={cn('mb-4 flex h-16 w-16 items-center justify-center rounded-full', TONE_STYLES[tone])}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-8 w-8"
          role="img"
          aria-label={label}
        >
          <title>{label}</title>
          <path strokeLinecap="round" strokeLinejoin="round" d={TONE_ICONS[tone]} />
        </svg>
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground mt-2 text-balance">{description}</p>
      {children}
    </div>
  );
}
