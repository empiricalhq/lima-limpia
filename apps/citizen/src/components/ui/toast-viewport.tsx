import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/context/toast-context';
import { Toast } from './toast';

export function ToastViewport() {
  const { toasts } = useToast();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View style={[styles.viewport, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
      {toasts.map((toast, index) => (
        <Toast key={toast.id} toast={toast} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    justifyContent: 'flex-end',
  },
});
