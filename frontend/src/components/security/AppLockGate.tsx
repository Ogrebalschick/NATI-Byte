import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Modal, StyleSheet, View } from 'react-native';
import PinLockScreen from '../../screens/PinLockScreen';
import { getUserPin } from '../../storage/appLockStorage';

type Phase = 'checking' | 'locked' | 'open';

/**
 * Covers the whole app on a cold start when a PIN is stored.
 * Account auth stays optional; this gate only protects the device.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pin = await getUserPin();
        if (!cancelled) setPhase(pin ? 'locked' : 'open');
      } catch (error) {
        console.warn('App lock check failed, opening the app', error);
        if (!cancelled) setPhase('open');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'locked') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [phase]);

  return (
    <View style={styles.root}>
      {children}
      {phase !== 'open' && <View style={styles.cover} />}
      <Modal
        visible={phase === 'locked'}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          // Android back must not dismiss the lock screen.
        }}
      >
        <PinLockScreen onUnlock={() => setPhase('open')} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#17161B',
    zIndex: 20,
    elevation: 20,
  },
});
