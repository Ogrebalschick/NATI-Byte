import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';

const ServicesScreen = () => {
  const insets = useSafeAreaInsets();

  return (
    <ScreenWrapper>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Сервисы</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.mark}>
          <Ionicons name="apps-sharp" size={28} color="#0A84FF" />
        </View>
        <Text style={styles.caption}>Раздел сервисов университета</Text>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 48,
    gap: 12,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    color: '#8E8E93',
    fontSize: 15,
  },
});

export default ServicesScreen;
