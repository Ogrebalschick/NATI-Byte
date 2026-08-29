import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Chat {
  id: string;
  title: string;
  messages: any[];
}

interface HistoryMenuProps {
  isVisible: boolean;
  onClose: () => void;
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onCreateChat: () => void;
  onDeleteChat: (id: string) => void;
}

const screenWidth = Dimensions.get('window').width;

const HistoryMenu: React.FC<HistoryMenuProps> = ({
  isVisible,
  onClose,
  chats,
  currentChatId,
  onSelectChat,
  onCreateChat,
  onDeleteChat,
}) => {
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuChatId, setContextMenuChatId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const [animatedVisible, setAnimatedVisible] = useState(false);
  const menuTranslateX = useRef(new Animated.Value(-screenWidth)).current;

  useEffect(() => {
    if (isVisible) {
      setAnimatedVisible(true);
      Animated.timing(menuTranslateX, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(menuTranslateX, {
        toValue: -screenWidth,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setAnimatedVisible(false);
      });
    }
  }, [isVisible]);

  if (!animatedVisible) return null;

  const openContextMenu = (chatId: string, event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setContextMenuChatId(chatId);
    setContextMenuPosition({ x: pageX - 80, y: pageY - 30 });
    setContextMenuVisible(true);
  };

  const closeContextMenu = () => {
    setContextMenuVisible(false);
    setContextMenuChatId(null);
  };

  const handleDelete = () => {
    if (contextMenuChatId) {
      onDeleteChat(contextMenuChatId);
    }
    closeContextMenu();
  };

  // Обработчики с задержкой для плавного закрытия
  const handleSelectChat = (chatId: string) => {
    onClose(); // запускает анимацию закрытия
    setTimeout(() => onSelectChat(chatId), 350);
  };

  const handleCreateChat = () => {
    onClose();
    setTimeout(() => onCreateChat(), 350);
  };

  return (
    <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
      <Animated.View style={[styles.menuContainer, { transform: [{ translateX: menuTranslateX }] }]}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuTitle}>Чаты</Text>
          <TouchableOpacity onPress={handleCreateChat} style={styles.newChatButton}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.chatList}>
          {chats.map(chat => (
            <View key={chat.id} style={[styles.chatItem, chat.id === currentChatId && styles.chatItemActive]}>
              <TouchableOpacity style={styles.chatContent} onPress={() => handleSelectChat(chat.id)}>
                <View style={styles.chatInfo}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {chat.title}
                  </Text>
                  <Text style={styles.chatSubtitle}>
                    {chat.messages.length} сообщений
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreButton}
                onPress={(e) => openContextMenu(chat.id, e)}
              >
                <Ionicons name="ellipsis-vertical" size={20} color="#8e8e93" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        {contextMenuVisible && (
          <TouchableWithoutFeedback onPress={closeContextMenu}>
            <View style={styles.contextOverlay}>
              <View style={[styles.contextMenu, { left: contextMenuPosition.x, top: contextMenuPosition.y }]}>
                <TouchableOpacity style={styles.contextMenuItem} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                  <Text style={[styles.contextMenuText, { color: '#ff3b30' }]}>Удалить чат</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

// Стили такие же как раньше, я их не менял, просто копирую из предыдущего варианта
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 20,
  },
  menuContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: screenWidth * 0.8,
    backgroundColor: '#1E1F20',
    paddingTop: 60,
    paddingHorizontal: 16,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  menuTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  newChatButton: {
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 30,
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  chatItemActive: {
    backgroundColor: 'rgba(0,122,255,0.2)',
    borderRadius: 8,
  },
  chatContent: {
    flex: 1,
  },
  chatInfo: {
    flex: 1,
  },
  chatTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  chatSubtitle: {
    color: '#8e8e93',
    fontSize: 12,
    marginTop: 4,
  },
  moreButton: {
    padding: 8,
    marginLeft: 8,
  },
  contextOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
  },
  contextMenu: {
    position: 'absolute',
    backgroundColor: '#2C2D2E',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  contextMenuText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#fff',
  },
});

export default HistoryMenu;