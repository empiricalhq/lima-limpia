import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** Return whether the app is active so background polling can stop. */
export function useAppState(): boolean {
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      setIsActive(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  return isActive;
}
