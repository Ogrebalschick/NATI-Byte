import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Expo Go sandbox — remote/local push APIs from expo-notifications crash on Android SDK 53+. */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
