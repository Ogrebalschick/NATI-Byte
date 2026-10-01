import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const SILENT_ERRORS = new Set(['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback']);

export function describeLocalAuthError(error: string): string | null {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
    case 'user_fallback':
      return null;
    case 'not_enrolled':
      return 'На устройстве не настроена биометрия';
    case 'not_available':
      return 'Биометрия недоступна на этом устройстве';
    case 'lockout':
      return 'Слишком много попыток. Введите PIN-код';
    case 'authentication_failed':
      return 'Не удалось распознать. Попробуйте ещё раз или введите PIN';
    case 'passcode_not_set':
      return 'На устройстве не задан код блокировки';
    case 'timeout':
      return 'Время ожидания биометрии истекло';
    default:
      return 'Не удалось подтвердить биометрию';
  }
}

/** Hardware must exist and have an enrolled fingerprint or face before we persist the flag. */
export async function ensureBiometricsAvailable(): Promise<void> {
  let hasHardware = false;
  try {
    hasHardware = await LocalAuthentication.hasHardwareAsync();
  } catch (error) {
    console.warn('hasHardwareAsync failed', error);
    throw new Error('Не удалось проверить биометрию на устройстве');
  }
  if (!hasHardware) {
    throw new Error('На этом устройстве нет сканера отпечатка или Face ID');
  }

  let enrolled = false;
  try {
    enrolled = await LocalAuthentication.isEnrolledAsync();
  } catch (error) {
    console.warn('isEnrolledAsync failed', error);
    throw new Error('Не удалось проверить, настроена ли биометрия');
  }
  if (!enrolled) {
    throw new Error('Сначала добавьте отпечаток или Face ID в настройках устройства');
  }
}

export type BiometricPromptResult =
  | { success: true }
  | { success: false; cancelled: boolean; message: string | null };

export async function authenticateWithBiometrics(
  promptMessage: string,
): Promise<BiometricPromptResult> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return {
        success: false,
        cancelled: false,
        message: 'На этом устройстве нет сканера отпечатка или Face ID',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Отмена',
      fallbackLabel: '',
      disableDeviceFallback: true,
    });

    if (result.success) return { success: true };

    return {
      success: false,
      cancelled: SILENT_ERRORS.has(result.error),
      message: describeLocalAuthError(result.error),
    };
  } catch (error) {
    console.warn('authenticateAsync failed', error);
    return {
      success: false,
      cancelled: false,
      message: 'Не удалось запустить биометрию',
    };
  }
}

export async function cancelBiometricPrompt(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await LocalAuthentication.cancelAuthenticate();
  } catch {
    // No prompt is active.
  }
}
