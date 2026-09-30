import React, { useState, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, API_URL } from '../context/AuthContext';
import { ScreenWrapper } from '../components/ScreenWrapper';
import HelloByte from '@/components/byte/helloByte';
import Input from '@/components/byte/input';
import Messages from '@/components/byte/messages';
import HistoryMenu from '@/components/byte/history';
import { handleApiError, createErrorMessage } from '@/components/byte/error';
import {
  isCrisisMessage,
  createCrisisMessage,
  extractRiskFromResponse,
} from '@/components/byte/crisis';
import { useChatSync } from '../hooks/useChatSync';
import {
  GUEST_CHATS_KEY,
  GUEST_FACTS_KEY,
  USER_CHATS_KEY,
  userChatsKey,
  userFactsKey,
} from '../storage/chatStorage';

export interface Message {
  id: number;
  who: 'user' | 'agent';
  message: string;
  isTyping?: boolean;
  isError?: boolean;
  isCrisis?: boolean;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

const MAX_HISTORY = 15;

function makeBlankChat(): Chat {
  return {
    id: Date.now().toString(),
    title: 'Новый чат',
    messages: [],
  };
}

function parseChatList(raw: string | null): Chat[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: Chat) => ({
      id: String(item.id),
      title: item.title || 'Новый чат',
      messages: Array.isArray(item.messages) ? item.messages : [],
    }));
  } catch {
    return [];
  }
}

function mergeChatLists(guest: Chat[], account: Chat[]): Chat[] {
  const guestIds = new Set(guest.map(chat => chat.id));
  return [...guest, ...account.filter(chat => !guestIds.has(chat.id))];
}

const Byte = () => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const tabBarHeight = useBottomTabBarHeight();

  // Auth state drives which AsyncStorage keys we read/write.
  const { isAuthenticated, user } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [facts, setFacts] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const { loadChats } = useChatSync(chats, currentChatId);
  const sessionKey = isAuthenticated && user ? `user:${user.id}` : 'guest';
  const loadedSession = useRef<string | null>(null);
  const wasAuthenticated = useRef(isAuthenticated);

  const messagesCountRef = useRef(0);
  const isAtTopRef = useRef(isAtTop);

  const [inputHeight, setInputHeight] = useState(70);
  const onInputLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    setInputHeight(height);
  };

  const currentMessages = chats.find(c => c.id === currentChatId)?.messages || [];

  // Reload (or reset) chats whenever the auth session changes.
  useEffect(() => {
    const loggedOut = wasAuthenticated.current && !isAuthenticated;
    wasAuthenticated.current = isAuthenticated;

    let cancelled = false;
    loadedSession.current = null;
    setHydrated(false);

    const applyChats = (next: Chat[]) => {
      const list = next.length > 0 ? next : [makeBlankChat()];
      setChats(list);
      setCurrentChatId(list[0].id);
    };

    const loadData = async () => {
      try {
        if (loggedOut) {
          applyChats([]);
          setFacts([]);
          setMenuOpen(false);
          setLoading(false);
          return;
        }

        if (!isAuthenticated || !user) {
          const guestChats = parseChatList(await AsyncStorage.getItem(GUEST_CHATS_KEY));
          const guestFacts = await AsyncStorage.getItem(GUEST_FACTS_KEY);
          if (cancelled) return;
          applyChats(guestChats);
          setFacts(guestFacts ? JSON.parse(guestFacts) : []);
          return;
        }

        const [guestChats, cloudRaw, userChatsRaw, legacyRaw, userFactsRaw, guestFactsRaw] =
          await Promise.all([
            AsyncStorage.getItem(GUEST_CHATS_KEY).then(parseChatList),
            loadChats(),
            AsyncStorage.getItem(userChatsKey(user.id)),
            AsyncStorage.getItem(USER_CHATS_KEY),
            AsyncStorage.getItem(userFactsKey(user.id)),
            AsyncStorage.getItem(GUEST_FACTS_KEY),
          ]);
        if (cancelled) return;

        const cloudChats = Array.isArray(cloudRaw) ? parseChatList(JSON.stringify(cloudRaw)) : [];
        const localUserChats = parseChatList(userChatsRaw || legacyRaw);
        applyChats(mergeChatLists(guestChats, cloudChats.length > 0 ? cloudChats : localUserChats));

        const factsRaw = userFactsRaw || guestFactsRaw;
        setFacts(factsRaw ? JSON.parse(factsRaw) : []);

        if (guestChats.length > 0) {
          await AsyncStorage.multiRemove([GUEST_CHATS_KEY, GUEST_FACTS_KEY]);
        }
      } catch (e) {
        console.warn('Failed to load data', e);
        if (!cancelled) applyChats([]);
      } finally {
        if (!cancelled) {
          loadedSession.current = sessionKey;
          setHydrated(true);
        }
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Persist to the active session bucket only after that session has hydrated.
  useEffect(() => {
    if (!hydrated || loadedSession.current !== sessionKey) return;
    const key = isAuthenticated && user ? userChatsKey(user.id) : GUEST_CHATS_KEY;
    if (chats.length > 0) {
      AsyncStorage.setItem(key, JSON.stringify(chats)).catch(console.warn);
    } else {
      AsyncStorage.removeItem(key).catch(console.warn);
    }
  }, [chats, hydrated, sessionKey, isAuthenticated, user]);

  useEffect(() => {
    if (!hydrated || loadedSession.current !== sessionKey) return;
    const key = isAuthenticated && user ? userFactsKey(user.id) : GUEST_FACTS_KEY;
    if (facts.length > 0) {
      AsyncStorage.setItem(key, JSON.stringify(facts)).catch(console.warn);
    } else {
      AsyncStorage.removeItem(key).catch(console.warn);
    }
  }, [facts, hydrated, sessionKey, isAuthenticated, user]);

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

  const handleScrollStateChange = (atTop: boolean) => {
    setIsAtTop(atTop);
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

    const typingId = Date.now() + 1;
    const typingMessage: Message = {
      id: typingId,
      who: 'agent',
      message: '•••',
      isTyping: true,
    };

    setChats(prev =>
      prev.map(chat =>
        chat.id === currentChatId
          ? { ...chat, messages: [...chat.messages, typingMessage] }
          : chat
      )
    );

    setLoading(true);

    if (isCrisisMessage(text)) {
      setChats(prev =>
        prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: chat.messages.filter(m => m.id !== typingId) }
            : chat
        )
      );
      const crisisMsg = createCrisisMessage(Date.now() + 2);
      setChats(prev =>
        prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, crisisMsg] }
            : chat
        )
      );
      setLoading(false);
      return;
    }

    const updatedMessages = [...(currentChat?.messages || []), userMessage];
    const limitedHistory = updatedMessages.slice(-MAX_HISTORY);
    const conversation: { role: 'system' | 'user' | 'assistant', content: string }[] = [];

    let systemPrompt =
      `Ты — Байт, дружелюбный помощник студента НГТУ. Отвечай на вопрос пользователя, но также оцени его эмоциональное состояние по шкале от 1 до 10, где 1 – полное спокойствие, 10 – сильный стресс или отчаяние.

Верни ответ в формате JSON:
{
  "answer": "твой развёрнутый ответ пользователю",
  "risk_score": число от 1 до 10
}

Никакого другого текста, только JSON.

Если пользователь выражает суицидальные мысли, намерения или сильное желание причинить себе вред, поставь risk_score не ниже 8.

Факты о пользователе (если есть) используй для персонализации, но не повторяй их в ответе, если они уже переданы.`;

    if (facts.length > 0) {
      systemPrompt += `\n\nПользователь уже сообщил о себе:\n${facts.map(f => `- ${f}`).join('\n')}`;
    }

    conversation.push({ role: 'system', content: systemPrompt });

    limitedHistory.forEach(msg => {
      conversation.push({
        role: msg.who === 'user' ? 'user' : 'assistant',
        content: msg.message,
      });
    });

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation }),
      });

      setChats(prev =>
        prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: chat.messages.filter(m => m.id !== typingId) }
            : chat
        )
      );

      const data = await response.json();

      if (response.ok) {
        const rawAnswer = data.answer || '';
        const parsed = extractRiskFromResponse(rawAnswer);
        if (parsed) {
          const { answer, riskScore } = parsed;
          if (riskScore >= 7) {
            const crisisMsg = createCrisisMessage(Date.now() + 2);
            setChats(prev =>
              prev.map(chat =>
                chat.id === currentChatId
                  ? { ...chat, messages: [...chat.messages, crisisMsg] }
                  : chat
              )
            );
            setLoading(false);
            return;
          }
          const agentMessage: Message = {
            id: Date.now() + 3,
            who: 'agent',
            message: answer,
          };
          setChats(prev =>
            prev.map(chat =>
              chat.id === currentChatId
                ? { ...chat, messages: [...chat.messages, agentMessage] }
                : chat
            )
          );
        } else {
          if (isCrisisMessage(rawAnswer)) {
            const crisisMsg = createCrisisMessage(Date.now() + 2);
            setChats(prev =>
              prev.map(chat =>
                chat.id === currentChatId
                  ? { ...chat, messages: [...chat.messages, crisisMsg] }
                  : chat
              )
            );
            setLoading(false);
            return;
          }
          const agentMessage: Message = {
            id: Date.now() + 3,
            who: 'agent',
            message: rawAnswer || 'Не удалось получить ответ',
          };
          setChats(prev =>
            prev.map(chat =>
              chat.id === currentChatId
                ? { ...chat, messages: [...chat.messages, agentMessage] }
                : chat
            )
          );
        }
      } else {
        const errorMessage = createErrorMessage('server');
        setChats(prev =>
          prev.map(chat =>
            chat.id === currentChatId
              ? { ...chat, messages: [...chat.messages, errorMessage] }
              : chat
          )
        );
      }
    } catch (error: any) {
      setChats(prev =>
        prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: chat.messages.filter(m => m.id !== typingId) }
            : chat
        )
      );
      const errorMessage = handleApiError(error);
      setChats(prev =>
        prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, errorMessage] }
            : chat
        )
      );
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const closeMenuWithAction = (action: () => void) => {
    setMenuOpen(false);
    setTimeout(action, 350);
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
  // listBottomOffset keeps the last message above the Input bar.
  // tabBarHeight is added so the Input itself clears the floating tab bar.
  const listBottomOffset = inputHeight + 8;

  return (
    <ScreenWrapper>
      {/* Tab bar is in normal flow — it pushes content up automatically.
          No manual paddingBottom needed here. */}
      <View style={styles.container}>
        <TouchableOpacity style={[styles.burgerButton, { top: insets.top + 8 }]} onPress={toggleMenu}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
        >
          <View style={styles.flex}>
            <View style={styles.messagesWrapper}>
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
            </View>

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
              onLayout={onInputLayout}
              extraBottom={6} // 👈 небольшой отступ от панели
            />
          </View>
        </KeyboardAvoidingView>
      </View>

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
  flex: {
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