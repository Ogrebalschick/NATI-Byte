import React, { useRef, useEffect, useState } from "react";
import { FlatList, StyleSheet, View, Keyboard, Text, Animated } from "react-native";
import Markdown from 'react-native-markdown-display';

// Тип сообщения расширенный
interface Message {
  id: number;
  who: 'user' | 'agent';
  message: string;
  status?: 'typing' | 'error';
  errorMessage?: string;
}

interface MessagesProps {
  messages: Message[];
  onScrollStateChange?: (isAtTop: boolean) => void;
  bottomOffset?: number;
}

// Компонент анимированных трёх точек
const TypingDots = () => {
  const [opacity1] = useState(new Animated.Value(0));
  const [opacity2] = useState(new Animated.Value(0));
  const [opacity3] = useState(new Animated.Value(0));

  useEffect(() => {
    const animateDot = (value: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 300,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = animateDot(opacity1, 0);
    const anim2 = animateDot(opacity2, 300);
    const anim3 = animateDot(opacity3, 600);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, []);

  return (
    <View style={{ flexDirection: 'row', padding: 10 }}>
      <Animated.Text style={[styles.dot, { opacity: opacity1 }]}>•</Animated.Text>
      <Animated.Text style={[styles.dot, { opacity: opacity2 }]}>•</Animated.Text>
      <Animated.Text style={[styles.dot, { opacity: opacity3 }]}>•</Animated.Text>
    </View>
  );
};

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

  const renderItem = ({ item }: { item: Message }) => {
    // Проверяем статус
    if (item.status === 'typing') {
      return (
        <View style={[styles.messageBubble, styles.agentBubble]}>
          <TypingDots />
        </View>
      );
    }

    if (item.status === 'error') {
      return (
        <View style={[styles.messageBubble, styles.agentBubble, styles.errorBubble]}>
          <Text style={styles.errorText}>⚠️ {item.errorMessage || 'Не удалось получить ответ. Попробуйте ещё раз.'}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.messageBubble, item.who === 'user' ? styles.userBubble : styles.agentBubble]}>
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
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16,
  },
  dot: {
    fontSize: 30,
    color: '#04CD73',
    marginHorizontal: 2,
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