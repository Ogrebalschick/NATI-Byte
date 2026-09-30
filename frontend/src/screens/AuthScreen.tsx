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
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ScreenWrapper } from '../components/ScreenWrapper';

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Password visibility toggles (separate for each field)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const { login, register } = useAuth();

  // Reset form state when switching between login and register
  const handleSwitchMode = () => {
    setIsLogin(!isLogin);
    setPassword('');
    setConfirmPassword('');
    setIsPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
  };

  const handleSubmit = async () => {
    // Basic field validation
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

    // Password confirmation check (registration only)
    if (!isLogin && password !== confirmPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
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
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>🤖 Байт</Text>
            <Text style={styles.subtitle}>
              {isLogin ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
            </Text>
          </View>

          <View style={styles.form}>
            {/* Name field — register only */}
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

            {/* Email field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="email@stud.nstu.ru"
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

            {/* Password field with eye toggle */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Пароль</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Минимум 6 символов"
                  placeholderTextColor="#8e8e93"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setIsPasswordVisible(prev => !prev)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isPasswordVisible
                    ? <EyeOff size={20} color="#8e8e93" />
                    : <Eye size={20} color="#8e8e93" />
                  }
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm password — register only */}
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Повторите пароль</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Повторите пароль"
                    placeholderTextColor="#8e8e93"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!isConfirmPasswordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setIsConfirmPasswordVisible(prev => !prev)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isConfirmPasswordVisible
                      ? <EyeOff size={20} color="#8e8e93" />
                      : <Eye size={20} color="#8e8e93" />
                    }
                  </TouchableOpacity>
                </View>
                {/* Inline mismatch hint */}
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <Text style={styles.errorHint}>Пароли не совпадают</Text>
                )}
              </View>
            )}

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
              onPress={handleSwitchMode}
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
  // Password field: row with input + eye icon
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1F20',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2D2E',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    color: '#8e8e93',
    fontSize: 12,
    marginTop: 4,
  },
  errorHint: {
    color: '#FF453A',
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
