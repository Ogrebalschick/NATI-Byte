import React, { useState, useEffect, useRef } from 'react';
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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { NstuImportModal } from '../components/NstuImportModal';

// ── Step type ──────────────────────────────────────────────────────────────────
// 'login'            — login form
// 'register'         — registration form
// 'verify_register'  — enter 6-digit code after /register/init
// 'verify_login'     — enter 6-digit code for 2FA after /login
type Step = 'login' | 'register' | 'verify_register' | 'verify_login';

const AuthScreen = () => {
  // ── Form fields ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Password visibility toggles
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [importImmediately, setImportImmediately] = useState(true);
  const [isWebViewVisible, setIsWebViewVisible] = useState(false);

  const pendingEmail = useRef('');

  const {
    login,
    verifyLogin,
    requestRegisterCode,
    verifyRegister,
    isAuthenticated,
    nstuLogin,
    parseCabinet,
    markLastSync,
  } = useAuth();
  const router = useRouter();

  // Don't pop the screen while the NSTU WebView is still scraping.
  useEffect(() => {
    if (isAuthenticated && !isWebViewVisible) router.back();
  }, [isAuthenticated, isWebViewVisible]);

  const showError = (msg: string) => setErrorMessage(msg);
  const clearError = () => setErrorMessage(null);

  // ── Switch between login / register ─────────────────────────────────────────

  const switchToLogin = () => {
    setStep('login');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    clearError();
    setIsPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
  };

  const switchToRegister = () => {
    setStep('register');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    clearError();
    setIsPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
  };

  // ── Submit handlers ──────────────────────────────────────────────────────────

  const handleLoginSubmit = async () => {
    clearError();
    if (!email.trim() || !password.trim()) { showError('Заполните все поля'); return; }

    setLoading(true);
    try {
      await login(email.trim(), password.trim());
      // On success: isAuthenticated flips → useEffect redirects
    } catch (err: any) {
      if (err.type === 'requires_verification') {
        // 2FA: show code input without clearing email
        pendingEmail.current = email.trim();
        setCode('');
        setStep('verify_login');
      } else {
        showError(err.message || 'Что-то пошло не так');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async () => {
    clearError();
    if (!name.trim()) { showError('Введите ваше имя'); return; }
    if (!email.trim()) { showError('Введите email'); return; }
    if (!email.endsWith('@stud.nstu.ru')) {
      showError('Только почта @stud.nstu.ru разрешена для регистрации');
      return;
    }
    if (!password.trim()) { showError('Введите пароль'); return; }
    if (password !== confirmPassword) { showError('Пароли не совпадают'); return; }

    setLoading(true);
    try {
      await requestRegisterCode(email.trim(), password.trim(), name.trim());
      pendingEmail.current = email.trim();
      setCode('');
      setStep('verify_register');
    } catch (err: any) {
      showError(err.message || 'Не удалось отправить код');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegister = async () => {
    clearError();
    if (code.trim().length !== 6) { showError('Введите 6-значный код'); return; }

    setLoading(true);
    try {
      await verifyRegister(pendingEmail.current, code.trim());
      // isAuthenticated → true → useEffect redirects
    } catch (err: any) {
      showError(err.message || 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLogin = async () => {
    clearError();
    if (code.trim().length !== 6) { showError('Введите 6-значный код'); return; }

    setLoading(true);
    try {
      await verifyLogin(pendingEmail.current, code.trim());
    } catch (err: any) {
      showError(err.message || 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const ErrorBanner = () =>
    errorMessage ? (
      <View style={styles.errorBanner}>
        <Text style={styles.errorBannerText}>{errorMessage}</Text>
      </View>
    ) : null;

  // ── Step: verify code (shared for register + login 2FA) ──────────────────────
  const renderVerifyStep = () => {
    const isRegVerify = step === 'verify_register';
    const maskedEmail = pendingEmail.current.replace(/(.{2}).+(@.+)/, '$1…$2');

    return (
      <View style={styles.form}>
        {/* Back */}
        <TouchableOpacity style={styles.backRow} onPress={isRegVerify ? switchToRegister : switchToLogin}>
          <ArrowLeft size={18} color="#8e8e93" />
          <Text style={styles.backText}>Назад</Text>
        </TouchableOpacity>

        {/* Icon */}
        <View style={styles.codeIconWrapper}>
          <Mail size={40} color="#007AFF" />
        </View>

        <Text style={styles.codeTitle}>
          {isRegVerify ? 'Подтверждение почты' : 'Двухфакторная аутентификация'}
        </Text>
        <Text style={styles.codeSubtitle}>
          Мы отправили 6-значный код на{'\n'}
          <Text style={styles.codeEmail}>{maskedEmail}</Text>
        </Text>

        {/* Code input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Код подтверждения</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="000000"
            placeholderTextColor="#636366"
            value={code}
            onChangeText={text => { setCode(text.replace(/\D/g, '').slice(0, 6)); clearError(); }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <Text style={styles.hint}>Код действителен 10 минут</Text>
        </View>

        <ErrorBanner />

        <TouchableOpacity
          style={[styles.button, (loading || code.length < 6) && styles.buttonDisabled]}
          onPress={isRegVerify ? handleVerifyRegister : handleVerifyLogin}
          disabled={loading || code.length < 6}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Подтвердить</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={isRegVerify ? handleRegisterSubmit : handleLoginSubmit}
        >
          <Text style={styles.switchText}>Отправить код повторно</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Step: login form ──────────────────────────────────────────────────────────
  const renderLoginForm = () => (
    <View style={styles.form}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="email@stud.nstu.ru"
          placeholderTextColor="#8e8e93"
          value={email}
          onChangeText={t => { setEmail(t); clearError(); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Пароль</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Ваш пароль"
            placeholderTextColor="#8e8e93"
            value={password}
            onChangeText={t => { setPassword(t); clearError(); }}
            secureTextEntry={!isPasswordVisible}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setIsPasswordVisible(p => !p)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isPasswordVisible ? <EyeOff size={20} color="#8e8e93" /> : <Eye size={20} color="#8e8e93" />}
          </TouchableOpacity>
        </View>
      </View>

      <ErrorBanner />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLoginSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>или</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={styles.nstuButton}
        onPress={() => setIsWebViewVisible(true)}
        disabled={loading}
      >
        <Text style={styles.nstuButtonText}>Войти через NSTU ID</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.switchButton} onPress={switchToRegister}>
        <Text style={styles.switchText}>Нет аккаунта? Зарегистрируйтесь</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Step: register form ───────────────────────────────────────────────────────
  const renderRegisterForm = () => (
    <View style={styles.form}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Имя</Text>
        <TextInput
          style={styles.input}
          placeholder="Ваше имя"
          placeholderTextColor="#8e8e93"
          value={name}
          onChangeText={t => { setName(t); clearError(); }}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="email@stud.nstu.ru"
          placeholderTextColor="#8e8e93"
          value={email}
          onChangeText={t => { setEmail(t); clearError(); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Только почта @stud.nstu.ru</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Пароль</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Минимум 6 символов"
            placeholderTextColor="#8e8e93"
            value={password}
            onChangeText={t => { setPassword(t); clearError(); }}
            secureTextEntry={!isPasswordVisible}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setIsPasswordVisible(p => !p)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isPasswordVisible ? <EyeOff size={20} color="#8e8e93" /> : <Eye size={20} color="#8e8e93" />}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Повторите пароль</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Повторите пароль"
            placeholderTextColor="#8e8e93"
            value={confirmPassword}
            onChangeText={t => { setConfirmPassword(t); clearError(); }}
            secureTextEntry={!isConfirmPasswordVisible}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setIsConfirmPasswordVisible(p => !p)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isConfirmPasswordVisible ? <EyeOff size={20} color="#8e8e93" /> : <Eye size={20} color="#8e8e93" />}
          </TouchableOpacity>
        </View>
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <Text style={styles.fieldError}>Пароли не совпадают</Text>
        )}
      </View>

      <ErrorBanner />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegisterSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Зарегистрироваться</Text>
        }
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>или</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.importToggle}>
        <View style={styles.importToggleText}>
          <Text style={styles.importToggleTitle}>Импортировать данные сразу</Text>
          <Text style={styles.importToggleHint}>
            BYTE автоматически соберёт ваше расписание, группу и ФИО. Вы можете сделать это позже в настройках.
          </Text>
        </View>
        <Switch
          value={importImmediately}
          onValueChange={setImportImmediately}
          trackColor={{ false: '#3a3a3c', true: '#007AFF' }}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity
        style={styles.nstuButton}
        onPress={() => setIsWebViewVisible(true)}
        disabled={loading}
      >
        <Text style={styles.nstuButtonText}>Зарегистрироваться через NSTU ID</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.switchButton} onPress={switchToLogin}>
        <Text style={styles.switchText}>Уже есть аккаунт? Войдите</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────────

  const isVerifyStep = step === 'verify_register' || step === 'verify_login';

  return (
    <ScreenWrapper bg="#17161B">
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          {/* Header — hidden during verify steps (they have their own heading) */}
          {!isVerifyStep && (
            <View style={styles.header}>
              <Text style={styles.title}>🤖 Байт</Text>
              <Text style={styles.subtitle}>
                {step === 'login' ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
              </Text>
            </View>
          )}

          {step === 'login'            && renderLoginForm()}
          {step === 'register'         && renderRegisterForm()}
          {isVerifyStep                && renderVerifyStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      <NstuImportModal
        visible={isWebViewVisible}
        mode="nstu-auth"
        importImmediately={step === 'register' ? importImmediately : false}
        onClose={() => setIsWebViewVisible(false)}
        onNstuLogin={nstuLogin}
        onScraped={parseCabinet}
        onFinished={() => {
          setIsWebViewVisible(false);
          markLastSync().catch(() => {});
        }}
      />
    </ScreenWrapper>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: { marginBottom: 40, alignItems: 'center' },
  title: { fontSize: 42, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#8e8e93' },
  form: { width: '100%' },
  inputGroup: { marginBottom: 20 },
  label: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 6 },
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
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1F20',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2D2E',
  },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16 },
  eyeButton: { paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  hint: { color: '#8e8e93', fontSize: 12, marginTop: 4 },
  fieldError: { color: '#FF453A', fontSize: 12, marginTop: 4 },
  errorBanner: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.35)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  errorBannerText: { color: '#FF453A', fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchButton: { marginTop: 16, alignItems: 'center' },
  switchText: { color: '#007AFF', fontSize: 14 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
    marginBottom: 6,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#2C2D2E' },
  dividerText: { color: '#636366', fontSize: 12 },
  nstuButton: {
    backgroundColor: '#1E1F20',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  nstuButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  importToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 4,
  },
  importToggleText: { flex: 1 },
  importToggleTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  importToggleHint: { color: '#8e8e93', fontSize: 12, lineHeight: 17 },

  // Verify step specific
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 32 },
  backText: { color: '#8e8e93', fontSize: 15 },
  codeIconWrapper: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,122,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  codeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  codeSubtitle: {
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  codeEmail: { color: '#d1d1d6', fontWeight: '600' },
  codeInput: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 10,
  },
});

export default AuthScreen;
