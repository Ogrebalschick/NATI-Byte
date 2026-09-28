import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ScreenWrapper } from '../components/ScreenWrapper';

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();

  const handleSubmit = async () => {
    // Валидация
    if (!email.trim() || !password.trim()) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }

    if (!isLogin && !name.trim()) {
      Alert.alert('Ошибка', 'Введите ваше имя');
      return;
    }

    if (!isLogin && !email.endsWith('@stud.nstu.ru')) {
      Alert.alert('Ошибка', 'Только почта @stud.nstu.ru разрешена для регистрации');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(email.trim(), password.trim());
      } else {
        await register(email.trim(), password.trim(), name.trim());
      }
    } catch (error: any) {
      Alert.alert('Ошибка', error.message || 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper bg="#17161B">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>🤖 Байт</Text>
            <Text style={styles.subtitle}>
              {isLogin ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
            </Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Имя</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ваше имя"
                  placeholderTextColor="#8e8e93"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder={isLogin ? "email@stud.nstu.ru" : "email@stud.nstu.ru"}
                placeholderTextColor="#8e8e93"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!isLogin && (
                <Text style={styles.hint}>Только почта @stud.nstu.ru</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Пароль</Text>
              <TextInput
                style={styles.input}
                placeholder="Минимум 6 символов"
                placeholderTextColor="#8e8e93"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? 'Войти' : 'Зарегистрироваться'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setIsLogin(!isLogin)}
            >
              <Text style={styles.switchText}>
                {isLogin
                  ? 'Нет аккаунта? Зарегистрируйтесь'
                  : 'Уже есть аккаунт? Войдите'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8e8e93',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1E1F20',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2C2D2E',
  },
  hint: {
    color: '#8e8e93',
    fontSize: 12,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    color: '#007AFF',
    fontSize: 14,
  },
});

export default AuthScreen;