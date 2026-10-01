import { Platform } from 'react-native';

export const API_URL =
  Platform.OS === 'android'
    ? 'http://192.168.50.100:8000'
    : 'http://localhost:8000';
