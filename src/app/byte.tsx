import HelloByte from '@/components/byte/helloByte';
import Input from '@/components/byte/input';
import Messages from '@/components/byte/messages';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Keyboard, // 👈 Импортируем для скрытия клавиатуры по клику
    KeyboardAvoidingView, // 👈 Компонент для поднятия элементов над клавиатурой
    Platform, // 👈 Для определения iOS / Android
    StyleSheet,
    TouchableWithoutFeedback, // 👈 Чтобы закрывать клавиатуру при тапе мимо инпута
    View
} from "react-native";
import { ScreenWrapper } from '../components/ScreenWrapper';

interface Message {
    id: number;
    who: string;
    message: string;
}

let Byte = () => {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);

    // {
    //     id: 1,
    //     who: 'user',
    //     message: 'Привет! Нужна помощь!'
    // },
    // {
    //     id: 2,
    //     who: 'agent',
    //     message: 'Привет, чем могу помочь?'
    // },

    const handleSend = (text: string) => {
        const newMessage = {
            id: Date.now(),
            who: 'user',
            message: text,
        }
        setMessages((prevMessages) => [...prevMessages, newMessage]);
    }

    return (
        <ScreenWrapper>
            {/* 1. KeyboardAvoidingView оборачивает весь контент экрана */}
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // Отступ под шапку/экран (если нужно подстроить)
            >
                {/* 2. Закрываем клавиатуру, если пользователь тапает в свободное место экрана */}
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.innerContainer}>
                        {messages.length > 0 ? (<Messages messages={messages} />) : (<HelloByte />)}
                        <Input onSend={handleSend} />
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    innerContainer: {
        flex: 1,
        justifyContent: 'space-between',
        paddingBottom: 10,
    },
});

export default Byte;