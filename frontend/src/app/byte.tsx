import HelloByte from '@/components/byte/helloByte';
import Input from '@/components/byte/input';
import Messages from '@/components/byte/messages';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    TouchableWithoutFeedback,
    View,
    ActivityIndicator,
    Alert,
} from "react-native";
import { ScreenWrapper } from '../components/ScreenWrapper';

interface Message {
    id: number;
    who: 'user' | 'agent';
    message: string;
}


const API_URL = Platform.OS === 'android' ? 'http://192.168.0.179:8000' : 'http://localhost:8000';

let Byte = () => {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSend = async (text: string) => {
        if (!text.trim()) return;

        // Добавляем сообщение пользователя
        const userMessage: Message = {
            id: Date.now(),
            who: 'user',
            message: text.trim(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Показываем индикатор загрузки (можно добавить временное сообщение)
        setLoading(true);

        try {
            // Отправляем запрос на бэкенд
            const response = await fetch(
                `${API_URL}/ask?query=${encodeURIComponent(text.trim())}`
            );
            const data = await response.json();

            if (response.ok) {
                // Добавляем ответ от бота
                const agentMessage: Message = {
                    id: Date.now() + 1,
                    who: 'agent',
                    message: data.answer || 'Не удалось получить ответ',
                };
                setMessages((prev) => [...prev, agentMessage]);
            } else {
                // Если сервер вернул ошибку
                Alert.alert('Ошибка', data.error || 'Неизвестная ошибка');
            }
        } catch (error: any) {
            // Ошибка сети или другие исключения
            Alert.alert('Ошибка', 'Не удалось соединиться с сервером. Проверьте подключение.');
            console.error('Request error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenWrapper>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.innerContainer}>
                        {messages.length > 0 ? (
                            <Messages messages={messages} />
                        ) : (
                            <HelloByte />
                        )}
                        <View style={styles.bottomSection}>
                            {loading && (
                                <ActivityIndicator
                                    size="small"
                                    color="#007AFF"
                                    style={{ marginBottom: 8 }}
                                />
                            )}
                            <Input onSend={handleSend} disabled={loading} />
                        </View>
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
    },
    bottomSection: {
        paddingBottom: 10,
    },
});

export default Byte;