import React, { useRef, useEffect } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import Markdown from 'react-native-markdown-display';

let Messages = (props: any) => {
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        if (props.messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: true });
        }
    }, [props.messages]);

    return (
        <View style={styles.contentArea}>
            <FlatList
                ref={flatListRef}
                data={props.messages}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.contentAreaInner}
                renderItem={({ item }) => (
                    <View style={[styles.messageBubble, item.who === 'user' ? styles.userBubble : styles.agentBubble]}>
                        <Markdown style={markdownStyles}>{item.message}</Markdown>
                    </View>
                )}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"      
                showsVerticalScrollIndicator={true}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    contentArea: {
        flex: 1, // занимает всё доступное пространство
    },
    contentAreaInner: {
        gap: 5,
        paddingBottom: 20, // небольшой отступ снизу, чтобы не прилипало
        paddingTop: 20,
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