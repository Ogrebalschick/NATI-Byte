import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {View, Text} from 'react-native'
import Byte from './byte';

export default function Index() {
  const router = useRouter();
  return (
      <Byte />
  );
}
