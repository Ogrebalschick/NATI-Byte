import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
let Messages = (props: any) => {
    return (
        <View style={styles.contentArea}>
            <FlatList
                data={props.messages}
                keyExtractor={(item) => item.id.toString()} contentContainerStyle={styles.contentAreaInner}
                renderItem={({ item }) => (
                    <View style={[styles.messageBubble, item.who === 'user' ? styles.userBubble : styles.agentBubble]}>
                        <Text style={styles.messageText}>{item.message}</Text>
                    </View>
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    contentArea: {
        flex: 1,

    },
    contentAreaInner: {
        gap: 5,
    },
    messageBubble: {
        padding: 10,
        borderRadius: 20,
        flexDirection: 'row',
        borderWidth: 1,
    },
    userBubble: {
        padding: 10,
        // backgroundColor:'#CF9228',
        borderColor: '#CF9228',
        justifyContent: 'flex-end',
        maxWidth: "70%",
        textAlign: 'right',
        borderEndEndRadius: 0,
        marginLeft: 'auto'
    },
    agentBubble: {
        // backgroundColor:'#04CD73',
        borderColor: '#04CD73',
        justifyContent: 'flex-end',
        maxWidth: "100%",
        textAlign: 'left',
        borderStartEndRadius: 0,
        marginRight: 'auto'
    },
    messageText: {
        color: '#fff',
    },

})

export default Messages;