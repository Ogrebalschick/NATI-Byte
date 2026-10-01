import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Model name sent with login. On web the server reads User-Agent instead. */
export function currentDeviceName(): string | undefined {
  if (Platform.OS === 'web') return undefined;
  const model = Device.modelName?.trim();
  if (model) return model.slice(0, 120);
  if (Platform.OS === 'ios') return 'iPhone';
  return 'Android';
}
