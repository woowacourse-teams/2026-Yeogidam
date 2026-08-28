import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

type CopyToastContextValue = {
  showCopyToast: (message: string) => void;
};

const CopyToastContext = createContext<CopyToastContextValue | null>(null);

export function CopyToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCopyToast = (nextMessage: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setMessage(nextMessage);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 1800);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <CopyToastContext.Provider value={{ showCopyToast }}>
      <View style={styles.screen}>
        {children}
        <CopyToast visible={visible} message={message} />
      </View>
    </CopyToastContext.Provider>
  );
}

export function useCopyToast() {
  const context = useContext(CopyToastContext);

  if (!context) {
    throw new Error('useCopyToast must be used inside CopyToastProvider');
  }

  return context;
}

function CopyToast({
  visible,
  message,
}: {
  visible: boolean;
  message: string;
}) {
  const translateY = useRef(new Animated.Value(72)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : 72,
        duration: visible ? 180 : 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 160 : 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 16,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1B1B1B',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
