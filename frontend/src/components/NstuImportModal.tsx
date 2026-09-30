import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NSTU_HOME = 'https://nstu.ru';
const LOGIN_HINT = 'ciu.nstu.ru/student_study';
// Real cabinet URLs (ciu.nstu.ru), matching the student_study login marker.
const PROFILE_URL = 'https://ciu.nstu.ru/student_study/personal/contact_info';
const TIMETABLE_URL = 'https://ciu.nstu.ru/student_study/timetable/timetable_lessons';

type ScrapePhase =
  | 'awaiting_login'
  | 'goto_profile'
  | 'scrape_profile'
  | 'goto_timetable'
  | 'scrape_timetable'
  | 'done';

type StatusKey = 'login' | 'profile' | 'timetable' | 'saving';

const STATUS_TEXT: Record<StatusKey, string> = {
  login: 'Войдите в личный кабинет НГТУ',
  profile: 'Собираем данные профиля…',
  timetable: 'Собираем расписание…',
  saving: 'Отправляем данные в BYTE…',
};

function scrapeScript(type: 'profile' | 'timetable') {
  return `
    (function() {
      try {
        var text = (document.body && document.body.innerText) ? document.body.innerText : '';
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${type}', text: text }));
      } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', text: String(e) }));
      }
      true;
    })();
  `;
}

function navigateScript(url: string) {
  return `
    (function() {
      window.location.href = ${JSON.stringify(url)};
      true;
    })();
  `;
}

interface NstuImportModalProps {
  visible: boolean;
  onClose: () => void;
  onScraped: (pageType: 'profile' | 'timetable', rawText: string) => Promise<void>;
  onFinished: () => void;
}

export const NstuImportModal = ({ visible, onClose, onScraped, onFinished }: NstuImportModalProps) => {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const phaseRef = useRef<ScrapePhase>('awaiting_login');
  const lastScrapeUrl = useRef('');
  const sendingRef = useRef(false);

  const [status, setStatus] = useState<StatusKey>('login');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      phaseRef.current = 'awaiting_login';
      lastScrapeUrl.current = '';
      sendingRef.current = false;
      setStatus('login');
      setError(null);
    }
  }, [visible]);

  const handleNav = (nav: WebViewNavigation) => {
    if (nav.loading) return;
    const url = nav.url || '';
    const phase = phaseRef.current;

    // Student has reached the cabinet — start the sequential scrape.
    if (phase === 'awaiting_login' && url.includes(LOGIN_HINT)) {
      if (url.includes('personal/contact_info')) {
        phaseRef.current = 'scrape_profile';
        setStatus('profile');
        lastScrapeUrl.current = url;
        webRef.current?.injectJavaScript(scrapeScript('profile'));
        return;
      }
      phaseRef.current = 'goto_profile';
      setStatus('profile');
      webRef.current?.injectJavaScript(navigateScript(PROFILE_URL));
      return;
    }

    if (
      (phase === 'goto_profile' || phase === 'scrape_profile') &&
      url.includes('personal/contact_info') &&
      lastScrapeUrl.current !== url
    ) {
      phaseRef.current = 'scrape_profile';
      lastScrapeUrl.current = url;
      setStatus('profile');
      webRef.current?.injectJavaScript(scrapeScript('profile'));
      return;
    }

    if (
      (phase === 'goto_timetable' || phase === 'scrape_timetable') &&
      url.includes('timetable/timetable_lessons') &&
      lastScrapeUrl.current !== url
    ) {
      phaseRef.current = 'scrape_timetable';
      lastScrapeUrl.current = url;
      setStatus('timetable');
      webRef.current?.injectJavaScript(scrapeScript('timetable'));
    }
  };

  const handleMessage = async (raw: string) => {
    if (sendingRef.current) return;
    let parsed: { type?: string; text?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed.type === 'error') {
      setError(parsed.text || 'Не удалось прочитать страницу');
      return;
    }

    if (parsed.type !== 'profile' && parsed.type !== 'timetable') return;
    if (!parsed.text || !parsed.text.trim()) {
      setError('На странице не найден текст. Откройте нужный раздел вручную и попробуйте снова.');
      return;
    }

    sendingRef.current = true;
    setStatus('saving');
    setError(null);
    try {
      await onScraped(parsed.type, parsed.text);
      if (parsed.type === 'profile') {
        phaseRef.current = 'goto_timetable';
        lastScrapeUrl.current = '';
        setStatus('timetable');
        webRef.current?.injectJavaScript(navigateScript(TIMETABLE_URL));
      } else {
        phaseRef.current = 'done';
        onFinished();
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось отправить данные на сервер');
    } finally {
      sendingRef.current = false;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Личный кабинет НГТУ</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={styles.statusBar}>
          {status !== 'login' && <ActivityIndicator size="small" color="#007AFF" />}
          <Text style={styles.statusText}>{STATUS_TEXT[status]}</Text>
        </View>

        {error && (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <WebView
          ref={webRef}
          source={{ uri: NSTU_HOME }}
          style={styles.webview}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          mixedContentMode="always"
          onNavigationStateChange={handleNav}
          onMessage={event => handleMessage(event.nativeEvent.data)}
          userAgent={
            Platform.OS === 'android'
              ? undefined
              : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          }
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#17161B' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1C1C1E',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#111114',
  },
  statusText: { color: '#d1d1d6', fontSize: 13, flex: 1 },
  errorBar: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: { color: '#FF453A', fontSize: 13, lineHeight: 18 },
  webview: { flex: 1, backgroundColor: '#fff' },
});
