import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, TextInput, TouchableOpacity } from "react-native";

let Input = (props: any) => {

    const { onSend, disabled } = props;

    const [text, setText] = useState('');

    const isEntered = text.trim().length > 0;

    const buttonAnim = useRef(new Animated.Value(0)).current;
    const paddingAnim = useRef(new Animated.Value(16)).current;

    const handleSend = () => {
        if (!isEntered || disabled) return; 
        props.onSend(text.trim());
        setText('');
    };

    useEffect(() => {
        Animated.parallel([
            Animated.timing(buttonAnim, {
                toValue: isEntered ? 1 : 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(paddingAnim, {
                toValue: isEntered ? 55 : 16,
                duration: 250,
                useNativeDriver: false,
            })
        ]).start();
    }, [isEntered]);

    return (
        <Animated.View style={[styles.inputWrapper, { paddingBottom: paddingAnim }]}>
            <TextInput style={styles.input} placeholder="Спросить Байта" placeholderTextColor="#8e8e93" multiline={true} value={text} onChangeText={setText} />
            <Animated.View style={[styles.controlPanel, { opacity: buttonAnim, transform: [{ scale: buttonAnim }], }]} pointerEvents={isEntered ? 'auto' : 'none'} >
                <TouchableOpacity style={styles.sendButton} onPress={handleSend} >
                    <Ionicons name="send" size={18} color="#FFF" />
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    )
}

const styles = StyleSheet.create({
    inputWrapper: {
        position: 'relative',
        backgroundColor: '#1E1F20',
        borderRadius: 20,
        paddingTop: 16,
        paddingHorizontal: 16,
    },
     input: {
        color: '#fff',
        fontSize: 16,
        textAlignVertical: 'top',
        maxHeight: 150, 
    },
        controlPanel: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
        sendButton: {
        backgroundColor: '#007AFF',
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
    },
})
export default Input;