import React, { useState, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Text,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '../components/ScreenWrapper';
import HelloByte from '@/components/byte/helloByte';
import Input from '@/components/byte/input';
import Messages from '@/components/byte/messages';

interface Message {
  id: number;
  who: 'user' | 'agent';
  message: string;
}

const API_URL = Platform.OS === 'android' ? 'http://192.168.0.179:8000' : 'http://localhost:8000';
const INPUT_BOTTOM_OFFSET = 10;
const MAX_HISTORY = 15;

const Byte = () => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);

  const translateY = useRef(new Animated.Value(0)).current;
  const bottomPadding = useRef(new Animated.Value(0)).current;

  const messagesCountRef = useRef(messages.length);
  const isAtTopRef = useRef(isAtTop);

  const [inputHeight, setInputHeight] = useState(70);
  const onInputLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    setInputHeight(height);
  };

  useEffect(() => {
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    isAtTopRef.current = isAtTop;
  }, [isAtTop]);

  useEffect(() => {
    const showListener = Keyboard.addListener('keyboardDidShow', (e) => {
      const height = e.endCoordinates.height;
      setKeyboardHeight(height);
      setKeyboardVisible(true);

      const hasMessages = messagesCountRef.current > 0;
      const atTop = isAtTopRef.current;
      const shouldShift = hasMessages && !atTop;

      if (shouldShift) {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -(height + INPUT_BOTTOM_OFFSET),
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(bottomPadding, {
            toValue: 0,
            duration: 250,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(bottomPadding, {
            toValue: hasMessages ? 0 : height + INPUT_BOTTOM_OFFSET,
            duration: 250,
            useNativeDriver: false,
          }),
        ]).start();
      }
    });

    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(bottomPadding, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardVisible && keyboardHeight > 0) {
      const hasMessages = messages.length > 0;
      const atTop = isAtTop;
      const shouldShift = hasMessages && !atTop;

      if (shouldShift) {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -(keyboardHeight + INPUT_BOTTOM_OFFSET),
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(bottomPadding, {
            toValue: 0,
            duration: 250,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(bottomPadding, {
            toValue: hasMessages ? 0 : keyboardHeight + INPUT_BOTTOM_OFFSET,
            duration: 250,
            useNativeDriver: false,
          }),
        ]).start();
      }
    }
  }, [messages.length, isAtTop, keyboardVisible, keyboardHeight]);

  const handleScrollStateChange = (atTop: boolean) => {
    if (!keyboardVisible) {
      setIsAtTop(atTop);
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      who: 'user',
      message: text.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const currentMessages = messages;
    const fullHistory = [...currentMessages, userMessage];

    const limitedHistory = fullHistory.slice(-MAX_HISTORY);

    const conversation = limitedHistory.map((msg) => ({
      role: msg.who === 'user' ? 'user' : 'assistant',
      content: msg.message,
    }));

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: conversation }),
      });

      const data = await response.json();
      if (response.ok) {
        const agentMessage: Message = {
          id: Date.now() + 1,
          who: 'agent',
          message: data.answer || 'Не удалось получить ответ',
        };
        setMessages((prev) => [...prev, agentMessage]);
      } else {
        Alert.alert('Ошибка', data.error || 'Неизвестная ошибка');
      }
    } catch (error: any) {
      Alert.alert('Ошибка', 'Не удалось соединиться с сервером.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  // ============================================================

  const generateTestMessages = () => {
    const longText =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ".repeat(
        3
      );
    const testMessages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      testMessages.push({
        id: Date.now() + i,
        who: i % 2 === 0 ? 'user' : 'agent',
        message: `Сообщение #${i + 1}: ${longText.substring(0, 100 + i * 10)}`,
      });
    }
    setMessages(testMessages);
  };

  const hasMessages = messages.length > 0;
  const atTop = isAtTop;
  const keyboardOpen = keyboardVisible;

  let extraBottom = bottomInset;
  if (!hasMessages && keyboardOpen) {
    extraBottom += keyboardHeight + INPUT_BOTTOM_OFFSET;
  } else if (hasMessages && atTop && keyboardOpen) {
    extraBottom += keyboardHeight + INPUT_BOTTOM_OFFSET;
  }

  const listBottomOffset = inputHeight + extraBottom + 8;

  return (
    <ScreenWrapper>
      <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
        <Animated.View
          style={[
            styles.messagesWrapper,
            { paddingBottom: bottomPadding },
          ]}
        >
          {hasMessages ? (
            <Messages
              messages={messages}
              onScrollStateChange={handleScrollStateChange}
              bottomOffset={listBottomOffset}
            />
          ) : (
            <View style={styles.helloWrapper}>
              <HelloByte />
              {/* <TouchableOpacity style={styles.testButton} onPress={generateTestMessages}>
                <Text style={styles.testButtonText}>📋 Загрузить тестовые сообщения</Text>
              </TouchableOpacity> */}
            </View>
          )}
        </Animated.View>

        {loading && (
          <ActivityIndicator
            size="small"
            color="#007AFF"
            style={styles.loader}
          />
        )}

        <Input
          onSend={handleSend}
          disabled={loading}
          extraBottom={extraBottom}
          onLayout={onInputLayout}
        />
      </Animated.View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesWrapper: {
    flex: 1,
  },
  helloWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 100,
  },
  testButtonText: {
    color: '#fff',
    textAlign: 'center',
  },
  loader: {
    alignSelf: 'center',
    marginBottom: 8,
  },
});

export default Byte;