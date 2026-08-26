import React, { useRef, useEffect } from "react";
import { FlatList, StyleSheet, View, Keyboard } from "react-native";
import Markdown from 'react-native-markdown-display';

interface Message {
  id: number;
  who: 'user' | 'agent';
  message: string;
}

interface MessagesProps {
  messages: Message[];
  onScrollStateChange?: (isAtTop: boolean) => void;
  bottomOffset?: number; // дополнительный отступ снизу (высота инпута + extraBottom + зазор)
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

  return (
    <View style={styles.contentArea}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={[styles.messageBubble, item.who === 'user' ? styles.userBubble : styles.agentBubble]}>
            <Markdown style={markdownStyles}>{item.message}</Markdown>
          </View>
        )}
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
    // paddingBottom будет динамическим
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