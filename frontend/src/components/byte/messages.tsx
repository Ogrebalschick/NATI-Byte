import React, { useRef, useEffect, useState } from "react";
import { FlatList, StyleSheet, View, Keyboard, Text } from "react-native";
import Markdown from 'react-native-markdown-display';

interface Message {
  id: number;
  who: 'user' | 'agent';
  message: string;
  isTyping?: boolean;
  isError?: boolean;
  isCrisis?: boolean;
}

interface MessagesProps {
  messages: Message[];
  onScrollStateChange?: (isAtTop: boolean) => void;
  bottomOffset?: number;
}

const Messages: React.FC<MessagesProps> = ({ messages, onScrollStateChange, bottomOffset = 0 }) => {
  const flatListRef = useRef<FlatList>(null);
  const prevOffsetY = useRef(0);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleScroll = (event: any) => {
    const { contentOffset } = event.nativeEvent;
    const currentOffsetY = contentOffset.y;
    const isAtTop = currentOffsetY <= 10;
    if (onScrollStateChange) {
      onScrollStateChange(isAtTop);
    }

    if (currentOffsetY < prevOffsetY.current - 5) {
      Keyboard.dismiss();
    }
    prevOffsetY.current = currentOffsetY;
  };

  // Компонент индикатора печатания
  const TypingIndicator = () => {
    const [dots, setDots] = useState('•');
    useEffect(() => {
      const interval = setInterval(() => {
        setDots(prev => {
          if (prev === '•') return '••';
          if (prev === '••') return '•••';
          return '•';
        });
      }, 500);
      return () => clearInterval(interval);
    }, []);
    return <Text style={{ color: '#fff', fontSize: 20 }}>{dots}</Text>;
  };

  const renderItem = ({ item }: { item: Message }) => {
    if (item.isTyping) {
      return (
        <View style={[styles.messageBubble, styles.agentBubble]}>
          <TypingIndicator />
        </View>
      );
    }

    // Можно добавить стилизацию для ошибок или кризисных сообщений
    const bubbleStyle = item.isError
      ? styles.errorBubble
      : item.isCrisis
      ? styles.crisisBubble
      : item.who === 'user'
      ? styles.userBubble
      : styles.agentBubble;

    return (
      <View style={[styles.messageBubble, bubbleStyle]}>
        <Markdown style={markdownStyles}>{item.message}</Markdown>
      </View>
    );
  };

  return (
    <View style={styles.contentArea}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={true}
        contentContainerStyle={[styles.contentAreaInner, { paddingBottom: 10 + bottomOffset }]}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  contentArea: {
    flex: 1,
  },
  contentAreaInner: {
    gap: 5,
    paddingTop: 40,
  },
  messageBubble: {
    padding: 10,
    borderRadius: 20,
    flexDirection: 'row',
    borderWidth: 1,
  },
  userBubble: {
    borderColor: '#CF9228',
    justifyContent: 'flex-end',
    maxWidth: "70%",
    textAlign: 'right',
    borderEndEndRadius: 0,
    marginLeft: 'auto'
  },
  agentBubble: {
    borderColor: '#04CD73',
    justifyContent: 'flex-end',
    maxWidth: "100%",
    textAlign: 'left',
    borderStartEndRadius: 0,
    marginRight: 'auto'
  },
  errorBubble: {
    borderColor: '#ff3b30',
    justifyContent: 'flex-end',
    maxWidth: "100%",
    textAlign: 'left',
    borderStartEndRadius: 0,
    marginRight: 'auto',
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  crisisBubble: {
    borderColor: '#ff9500',
    justifyContent: 'flex-end',
    maxWidth: "100%",
    textAlign: 'left',
    borderStartEndRadius: 0,
    marginRight: 'auto',
    backgroundColor: 'rgba(255,149,0,0.1)',
  },
});

const markdownStyles = {
  body: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
  },
  link: {
    color: '#0066cc',
    textDecorationLine: 'underline',
  },
};

export default Messages;