import { useEffect, useRef } from 'react';
import { useAuth, API_URL } from '../context/AuthContext';

interface Chat {
  id: string;
  title: string;
  messages: any[];
}

export const useChatSync = (chats: Chat[], currentChatId: string | null) => {
  const { token, isAuthenticated } = useAuth();
  const saveTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!isAuthenticated || !token || chats.length === 0) return;

    // Дебаунс сохранения (сохраняем через 3 секунды после последнего изменения)
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }

    saveTimeout.current = setTimeout(async () => {
      try {
        // Сохраняем все чаты на сервер
        for (const chat of chats) {
          await fetch(`${API_URL}/auth/chats/save`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: chat.id,
              title: chat.title,
              messages: chat.messages,
            }),
          });
        }
      } catch (error) {
        console.warn('Failed to save chats', error);
      }
    }, 3000);

    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
    };
  }, [chats, token, isAuthenticated]);

  // Загрузка чатов при входе
  const loadChats = async () => {
    if (!isAuthenticated || !token) return null;

    try {
      const response = await fetch(`${API_URL}/auth/chats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.warn('Failed to load chats', error);
    }
    return null;
  };

  return { loadChats };
};