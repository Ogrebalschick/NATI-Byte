import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, TextInput, TouchableOpacity, Keyboard } from "react-native";

interface InputProps {
    onSend: (text: string) => void;
    disabled?: boolean;
    extraBottom?: number;
    onLayout?: (event: any) => void;
}

const Input: React.FC<InputProps> = ({ onSend, disabled, extraBottom = 0, onLayout }) => {
    const [text, setText] = useState('');
    const isEntered = text.trim().length > 0;

    const buttonAnim = useRef(new Animated.Value(0)).current;
    const paddingAnim = useRef(new Animated.Value(16)).current;

    const handleSend = () => {
        if (!isEntered || disabled) return;
        Keyboard.dismiss();
        onSend(text.trim());
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
            }),
        ]).start();
    }, [isEntered]);

    return (
        <Animated.View
            onLayout={onLayout}
            style={[
                styles.inputWrapper,
                {
                    bottom: extraBottom,
                    paddingBottom: paddingAnim,
                },
            ]}
        >
            <TextInput
                style={styles.input}
                placeholder="Спросить Байта"
                placeholderTextColor="#8e8e93"
                multiline
                value={text}
                onChangeText={setText}
            />
            <Animated.View
                style={[
                    styles.controlPanel,
                    {
                        opacity: buttonAnim,
                        transform: [{ scale: buttonAnim }],
                    },
                ]}
                pointerEvents={isEntered ? 'auto' : 'none'}
            >
                <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
                    <Ionicons name="send" size={18} color="#FFF" />
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    inputWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        backgroundColor: '#1E1F20',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#1E1F20',
        paddingTop: 16,
        paddingHorizontal: 16,
        boxShadow: '0px 30px 50px 30px rgba(34, 60, 80, 0.5)',
        elevation: 10,
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
});

export default Input;