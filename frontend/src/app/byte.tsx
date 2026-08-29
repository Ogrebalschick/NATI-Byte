import React, { useState, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenWrapper } from '../components/ScreenWrapper';
import HelloByte from '@/components/byte/helloByte';
import Input from '@/components/byte/input';
import Messages from '@/components/byte/messages';
import HistoryMenu from '@/components/byte/history';

interface Message {
  id: number;
  who: 'user' | 'agent';
  message: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

const API_URL = Platform.OS === 'android' ? 'http://192.168.0.179:8000' : 'http://localhost:8000';
const INPUT_BOTTOM_OFFSET = 10;
const MAX_HISTORY = 15;
const STORAGE_KEY = '@byte_chats';

const Byte = () => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const translateY = useRef(new Animated.Value(0)).current;
  const bottomPadding = useRef(new Animated.Value(0)).current;

  const messagesCountRef = useRef(0);
  const isAtTopRef = useRef(isAtTop);

  const [inputHeight, setInputHeight] = useState(70);
  const onInputLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    setInputHeight(height);
  };

  const currentMessages = chats.find(c => c.id === currentChatId)?.messages || [];

  // Загрузка чатов
  useEffect(() => {
    const loadChats = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: Chat[] = JSON.parse(stored);
          setChats(parsed);
          if (parsed.length > 0) {
            setCurrentChatId(parsed[0].id);
          } else {
            createNewChat();
          }
        } else {
          createNewChat();
        }
      } catch (e) {
        console.warn('Failed to load chats', e);
        createNewChat();
      }
    };
    loadChats();
  }, []);

  // Сохранение
  useEffect(() => {
    if (chats.length > 0) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(chats)).catch(console.warn);
    }
  }, [chats]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'Новый чат',
      messages: [],
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
  };

  const switchChat = (chatId: string) => {
    setCurrentChatId(chatId);
    Keyboard.dismiss();
  };

  const deleteChat = (chatId: string) => {
    Alert.alert('Удалить чат', 'Вы уверены?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          const updated = chats.filter(c => c.id !== chatId);
          setChats(updated);
          if (chatId === currentChatId) {
            if (updated.length > 0) {
              setCurrentChatId(updated[0].id);
            } else {
              createNewChat();
            }
          }
        },
      },
    ]);
  };

  const updateChatTitle = (chatId: string, firstMessage: string) => {
    setChats(prev =>
      prev.map(chat =>
        chat.id === chatId && chat.title === 'Новый чат'
          ? { ...chat, title: firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '…' : '') }
          : chat
      )
    );
  };

  useEffect(() => {
    messagesCountRef.current = currentMessages.length;
  }, [currentMessages]);

  useEffect(() => {
    isAtTopRef.current = isAtTop;
  }, [isAtTop]);

  // Keyboard listeners
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
      const hasMessages = currentMessages.length > 0;
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
  }, [currentMessages.length, isAtTop, keyboardVisible, keyboardHeight]);

  const handleScrollStateChange = (atTop: boolean) => {
    if (!keyboardVisible) {
      setIsAtTop(atTop);
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || !currentChatId) return;

    const userMessage: Message = {
      id: Date.now(),
      who: 'user',
      message: text.trim(),
    };

    setChats(prev =>
      prev.map(chat =>
        chat.id === currentChatId
          ? { ...chat, messages: [...chat.messages, userMessage] }
          : chat
      )
    );

    const currentChat = chats.find(c => c.id === currentChatId);
    if (currentChat && currentChat.title === 'Новый чат') {
      updateChatTitle(currentChatId, text.trim());
    }

    setLoading(true);

    const updatedMessages = [...(currentChat?.messages || []), userMessage];
    const limitedHistory = updatedMessages.slice(-MAX_HISTORY);
    const conversation = limitedHistory.map((msg) => ({
      role: msg.who === 'user' ? 'user' : 'assistant',
      content: msg.message,
    }));

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation }),
      });
      const data = await response.json();
      if (response.ok) {
        const agentMessage: Message = {
          id: Date.now() + 1,
          who: 'agent',
          message: data.answer || 'Не удалось получить ответ',
        };
        setChats(prev =>
          prev.map(chat =>
            chat.id === currentChatId
              ? { ...chat, messages: [...chat.messages, agentMessage] }
              : chat
          )
        );
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

  // Плавное закрытие с действием
  const closeMenuWithAction = (action: () => void) => {
    setMenuOpen(false); // запускает анимацию закрытия в HistoryMenu
    setTimeout(action, 350); // ждём окончания анимации (300ms + запас)
  };

  const handleSelectChat = (chatId: string) => {
    closeMenuWithAction(() => switchChat(chatId));
  };

  const handleCreateChat = () => {
    closeMenuWithAction(() => createNewChat());
  };

  const handleDeleteChat = (chatId: string) => {
    deleteChat(chatId);
  };

  const toggleMenu = () => {
    setMenuOpen(prev => !prev);
  };

  const hasMessages = currentMessages.length > 0;
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
        <TouchableOpacity style={[styles.burgerButton, { top: insets.top + 8 }]} onPress={toggleMenu}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.messagesWrapper,
            { paddingBottom: bottomPadding },
          ]}
        >
          {hasMessages ? (
            <Messages
              messages={currentMessages}
              onScrollStateChange={handleScrollStateChange}
              bottomOffset={listBottomOffset}
            />
          ) : (
            <View style={styles.helloWrapper}>
              <HelloByte />
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

      <HistoryMenu
        isVisible={menuOpen}
        onClose={() => setMenuOpen(false)}
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onCreateChat={handleCreateChat}
        onDeleteChat={handleDeleteChat}
      />
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
  loader: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  burgerButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 30,
  },
});

export default Byte;