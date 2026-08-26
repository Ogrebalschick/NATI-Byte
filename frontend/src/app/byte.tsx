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

const Byte = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);
  const translateY = useRef(new Animated.Value(0)).current;
  const [inputPaddingBottom, setInputPaddingBottom] = useState(0);

  useEffect(() => {
    const showListener = Keyboard.addListener('keyboardDidShow', (e) => {
      const height = e.endCoordinates.height;
      setKeyboardHeight(height);
      if (isAtTop) {
        // Вверху – не двигаем контейнер, только поднимаем input
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start();
        setInputPaddingBottom(height + 10);
      } else {
        // Внизу – сдвигаем контейнер, input поднимается вместе с ним
        Animated.timing(translateY, {
          toValue: -(height + 10),
          duration: 250,
          useNativeDriver: true,
        }).start();
        setInputPaddingBottom(0);
      }
    });

    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setInputPaddingBottom(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [isAtTop]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userMessage: Message = {
      id: Date.now(),
      who: 'user',
      message: text.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/ask?query=${encodeURIComponent(text.trim())}`
      );
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

  return (
    <ScreenWrapper>
      <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
        <View style={styles.messagesWrapper}>
          {messages.length > 0 ? (
            <Messages
              messages={messages}
              onScrollStateChange={setIsAtTop}
            />
          ) : (
            <View style={styles.helloWrapper}>
              <HelloByte />
              {/* <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  padding: 10,
                  borderRadius: 8,
                  marginHorizontal: 16,
                  marginBottom: 8,
                }}
                onPress={generateTestMessages}
              >
                <Text style={{ color: '#fff', textAlign: 'center' }}>
                  📋 Загрузить тестовые сообщения
                </Text>
              </TouchableOpacity> */}
            </View>
          )}
        </View>

        <View style={[styles.inputWrapper, { paddingBottom: inputPaddingBottom }]}>
          {loading && <ActivityIndicator size="small" color="#007AFF" style={{ marginBottom: 8 }} />}
          <Input onSend={handleSend} disabled={loading} />
        </View>
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
  inputWrapper: {
    // paddingBottom задаётся динамически
  },
  helloWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Byte;