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

export type CabinetPageType =
  | 'profile'
  | 'timetable'
  | 'progress'
  | 'task'
  | 'kp_rgz_praktiki'
  | 'academic_backlog'
  | 'individual_progress'
  | 'timetable_consult'
  | 'timetable_session';

const NSTU_HOME = 'https://nstu.ru';
const LOGIN_HINT = 'ciu.nstu.ru/student_study';
const PROFILE_URL = 'https://ciu.nstu.ru/student_study/personal/contact_info';
const TIMETABLE_URL = 'https://ciu.nstu.ru/student_study/timetable/timetable_lessons';

/** Daily auto-sync crawl order (after a live cabinet session is detected). */
export const AUTO_SYNC_STEPS: { pageType: CabinetPageType; url: string; match: string }[] = [
  { pageType: 'profile', url: NSTU_HOME, match: 'nstu.ru' },
  { pageType: 'timetable', url: TIMETABLE_URL, match: 'timetable/timetable_lessons' },
  {
    pageType: 'timetable_consult',
    url: 'https://ciu.nstu.ru/student_study/timetable/timetable_consult',
    match: 'timetable/timetable_consult',
  },
  {
    pageType: 'timetable_session',
    url: 'https://ciu.nstu.ru/student_study/timetable/timetable_session',
    match: 'timetable/timetable_session',
  },
  {
    pageType: 'progress',
    url: 'https://ciu.nstu.ru/student_study/student_info/progress',
    match: 'student_info/progress',
  },
  {
    pageType: 'task',
    url: 'https://ciu.nstu.ru/student_study/student_info/task',
    match: 'student_info/task',
  },
  {
    pageType: 'kp_rgz_praktiki',
    url: 'https://ciu.nstu.ru/student_study/student_info/kp_rgz_praktiki',
    match: 'kp_rgz_praktiki',
  },
  {
    pageType: 'academic_backlog',
    url: 'https://ciu.nstu.ru/student_study/student_info/academic_backlog',
    match: 'academic_backlog',
  },
  {
    pageType: 'individual_progress',
    url: 'https://ciu.nstu.ru/student_study/individual_progress',
    match: 'individual_progress',
  },
];

type ScrapePhase =
  | 'awaiting_login'
  | 'goto_profile'
  | 'scrape_profile'
  | 'goto_timetable'
  | 'scrape_timetable'
  | 'auto_boot'
  | 'auto_goto'
  | 'auto_scrape'
  | 'done';

type StatusKey = 'login' | 'profile' | 'timetable' | 'saving';

const STATUS_TEXT: Record<StatusKey, string> = {
  login: 'Войдите в личный кабинет НГТУ',
  profile: 'Собираем данные профиля…',
  timetable: 'Собираем расписание…',
  saving: 'Отправляем данные в BYTE…',
};

function scrapeScript(type: string) {
  return `
    (function() {
      try {
        var text = (document.body && document.body.innerText) ? document.body.innerText : '';
        var email = '';
        var stud = text.match(/[A-Za-z0-9._%+\\-]+@stud\\.nstu\\.ru/i);
        if (stud) { email = stud[0]; }
        else {
          var any = text.match(/[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}/);
          if (any) { email = any[0]; }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${type}', text: text, email: email }));
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

export function extractEmailFromCabinetText(text: string): string | null {
  const stud = text.match(/[A-Za-z0-9._%+-]+@stud\.nstu\.ru/i);
  if (stud) return stud[0].toLowerCase();
  const any = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return any ? any[0].toLowerCase() : null;
}

/** True when the cabinet session is gone and CIU bounced us to a login/SSO page. */
export function isNstuLoginRedirect(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes(LOGIN_HINT)) return false;
  return (
    u.includes('/login') ||
    u.includes('logon') ||
    u.includes('signin') ||
    u.includes('id.nstu') ||
    u.includes('cas.nstu') ||
    u.includes('sso') ||
    (u.includes('ciu.nstu.ru') && (u.includes('auth') || u.includes('passport')))
  );
}

function urlMatchesStep(url: string, step: (typeof AUTO_SYNC_STEPS)[number]): boolean {
  const u = url.toLowerCase();
  if (step.pageType === 'profile' && step.url === NSTU_HOME) {
    return (
      /^https?:\/\/(www\.)?nstu\.ru(\/|$|\?|#)/i.test(url) &&
      !u.includes('ciu.nstu.ru')
    );
  }
  if (step.pageType === 'task') {
    return u.includes('student_info/task') && !u.includes('kp_rgz');
  }
  return u.includes(step.match.toLowerCase());
}

interface NstuImportModalProps {
  visible: boolean;
  onClose: () => void;
  /** 'sync' = BYTE user; 'nstu-auth' = NSTU ID login; 'auto-sync' = hidden daily crawl. */
  mode?: 'sync' | 'nstu-auth' | 'auto-sync';
  /** When mode is nstu-auth, also scrape timetable/profile into /sync/parse-cabinet. */
  importImmediately?: boolean;
  onNstuLogin?: (email: string) => Promise<void>;
  onScraped: (pageType: CabinetPageType, rawText: string) => Promise<void>;
  onFinished: () => void;
  onAuthError?: () => void;
}

export const NstuImportModal = ({
  visible,
  onClose,
  mode = 'sync',
  importImmediately = true,
  onNstuLogin,
  onScraped,
  onFinished,
  onAuthError,
}: NstuImportModalProps) => {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const phaseRef = useRef<ScrapePhase>('awaiting_login');
  const lastScrapeUrl = useRef('');
  const sendingRef = useRef(false);
  const autoIndexRef = useRef(0);
  const authErrorSent = useRef(false);

  const [status, setStatus] = useState<StatusKey>('login');
  const [error, setError] = useState<string | null>(null);

  const isAuto = mode === 'auto-sync';

  useEffect(() => {
    if (visible) {
      phaseRef.current = isAuto ? 'auto_boot' : 'awaiting_login';
      lastScrapeUrl.current = '';
      sendingRef.current = false;
      autoIndexRef.current = 0;
      authErrorSent.current = false;
      setStatus('login');
      setError(null);
    }
  }, [visible, isAuto]);

  const failAuth = () => {
    if (authErrorSent.current) return;
    authErrorSent.current = true;
    phaseRef.current = 'done';
    onAuthError?.();
  };

  const goToAutoStep = (index: number) => {
    const step = AUTO_SYNC_STEPS[index];
    if (!step) {
      phaseRef.current = 'done';
      onFinished();
      return;
    }
    autoIndexRef.current = index;
    lastScrapeUrl.current = '';
    phaseRef.current = 'auto_goto';
    setStatus('saving');
    webRef.current?.injectJavaScript(navigateScript(step.url));
  };

  const handleNav = (nav: WebViewNavigation) => {
    if (nav.loading) return;
    const url = nav.url || '';
    if (!url || url === 'about:blank') return;

    if (isAuto) {
      if (isNstuLoginRedirect(url)) {
        failAuth();
        return;
      }

      const phase = phaseRef.current;
      const step = AUTO_SYNC_STEPS[autoIndexRef.current];

      // First load of nstu.ru — if session is dead, CIU hops will hit failAuth later.
      if (phase === 'auto_boot') {
        if (url.includes(LOGIN_HINT)) {
          goToAutoStep(1);
          return;
        }
        if (urlMatchesStep(url, AUTO_SYNC_STEPS[0])) {
          phaseRef.current = 'auto_scrape';
          lastScrapeUrl.current = url;
          const type = AUTO_SYNC_STEPS[0].pageType;
          setTimeout(() => webRef.current?.injectJavaScript(scrapeScript(type)), 500);
        }
        return;
      }

      if ((phase === 'auto_goto' || phase === 'auto_scrape') && step && urlMatchesStep(url, step)) {
        if (lastScrapeUrl.current === url) return;
        phaseRef.current = 'auto_scrape';
        lastScrapeUrl.current = url;
        const type = step.pageType;
        setTimeout(() => webRef.current?.injectJavaScript(scrapeScript(type)), 500);
      }
      return;
    }

    const phase = phaseRef.current;

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
    let parsed: { type?: string; text?: string; email?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed.type === 'error') {
      if (isAuto) {
        goToAutoStep(autoIndexRef.current + 1);
        return;
      }
      setError(parsed.text || 'Не удалось прочитать страницу');
      return;
    }

    const pageType = parsed.type as CabinetPageType | undefined;
    if (!pageType) return;
    if (!parsed.text || !parsed.text.trim()) {
      if (isAuto) {
        // Empty page: skip and continue the chain rather than aborting the whole day.
        goToAutoStep(autoIndexRef.current + 1);
        return;
      }
      setError('На странице не найден текст. Откройте нужный раздел вручную и попробуйте снова.');
      return;
    }

    sendingRef.current = true;
    setStatus('saving');
    setError(null);
    try {
      if (isAuto) {
        await onScraped(pageType, parsed.text);
        goToAutoStep(autoIndexRef.current + 1);
        return;
      }

      if (pageType === 'profile' && mode === 'nstu-auth') {
        const email = (parsed.email || extractEmailFromCabinetText(parsed.text) || '').trim();
        if (!email) {
          throw new Error('Не удалось найти email в контактных данных личного кабинета');
        }
        if (onNstuLogin) {
          await onNstuLogin(email);
        }
        if (importImmediately) {
          await onScraped('profile', parsed.text);
          phaseRef.current = 'goto_timetable';
          lastScrapeUrl.current = '';
          setStatus('timetable');
          webRef.current?.injectJavaScript(navigateScript(TIMETABLE_URL));
        } else {
          phaseRef.current = 'done';
          onFinished();
        }
      } else {
        await onScraped(pageType, parsed.text);
        if (pageType === 'profile') {
          phaseRef.current = 'goto_timetable';
          lastScrapeUrl.current = '';
          setStatus('timetable');
          webRef.current?.injectJavaScript(navigateScript(TIMETABLE_URL));
        } else {
          phaseRef.current = 'done';
          onFinished();
        }
      }
    } catch (err: any) {
      if (isAuto) {
        goToAutoStep(autoIndexRef.current + 1);
      } else {
        setError(err.message || 'Не удалось отправить данные на сервер');
      }
    } finally {
      sendingRef.current = false;
    }
  };

  const webView = (
    <WebView
      ref={webRef}
      source={{ uri: NSTU_HOME }}
      style={isAuto ? styles.hiddenWebview : styles.webview}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      mixedContentMode="always"
      onNavigationStateChange={handleNav}
      onLoadEnd={event => {
        handleNav({
          ...event.nativeEvent,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          title: '',
          navigationType: 'other',
          lockIdentifier: 0,
        } as WebViewNavigation);
      }}
      onMessage={event => handleMessage(event.nativeEvent.data)}
      userAgent={
        Platform.OS === 'android'
          ? undefined
          : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    />
  );

  if (isAuto) {
    return (
      <Modal visible={visible} transparent animationType="none" hardwareAccelerated>
        <View style={styles.offscreen} pointerEvents="none">
          {webView}
        </View>
      </Modal>
    );
  }

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

        {webView}
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
  offscreen: {
    position: 'absolute',
    left: -480,
    top: 0,
    width: 360,
    height: 640,
    opacity: 0.01,
    overflow: 'hidden',
  },
  hiddenWebview: { width: 360, height: 640, backgroundColor: '#fff' },
});
