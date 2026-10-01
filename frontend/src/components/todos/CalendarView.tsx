/**
 * CalendarView — Google Calendar-style task calendar.
 *
 * Три режима:
 *   • День   — двухколоночная почасовая сетка (время слева, карточки справа).
 *              1 минута = 1 px (HOUR_HEIGHT = 60). Карточки занимают всю ширину
 *              правой колонки и абсолютно позиционированы внутри неё.
 *              Горизонтальный свайп → предыдущий/следующий день.
 *              Иконка 📅 слева от ленты открывает DateTimePicker.
 *   • Неделя — 7 колонок с 24-часовой сеткой. Шапка содержит диапазон дат +
 *              стрелки ◀ ▶. Горизонтальный свайп → предыдущая/следующая неделя.
 *   • Месяц  — сетка месяца; первый тап = выбор дня (подсветка + список задач),
 *              повторный тап по выбранному дню = переход в режим «День».
 *              Горизонтальный свайп → предыдущий/следующий месяц.
 *
 * Лента DayStrip (28 дней) отображается ТОЛЬКО в режиме «День».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { TodoTask, TodoProject } from '../../storage/todosStorage';

// ── Design tokens ─────────────────────────────────────────────────────────────

const BG     = '#17161B';
const CARD   = '#1C1C1E';
const CARD2  = '#232228';
const BORDER = '#2C2C2E';
const MUTED  = '#636366';
const TEXT   = '#EBEBF5';
const TEXT2  = '#8E8E93';

const SCHEDULE_COLOR = '#0A84FF';
const DEADLINE_COLOR = '#FF453A';

// ── Calendar constants ────────────────────────────────────────────────────────

const HOURS      = Array.from({ length: 24 }, (_, i) => i);     // 00–23
const START_HOUR = HOURS[0]!;                                    // 0
const END_HOUR   = HOURS[HOURS.length - 1]!;                     // 23

/**
 * 1 час = 60 px → 1 минута = 1 px.
 * При duration_minutes = 60 карточка займёт ровно 60 px высоты.
 */
const HOUR_HEIGHT = 60; // px per hour  →  1 час = 60 px
const PX_PER_MIN  = HOUR_HEIGHT / 60; // = 1  →  1 минута = 1 px
/**
 * Пороги адаптивного контента карточки.
 * MIN_CARD_H — нижняя граница высоты (15 мин → 20 px, не меньше).
 */
const MIN_CARD_H  = 20; // px — минимальная высота слота (скруглённая таблетка)
const COMPACT_H   = 45; // px — ниже этой границы: компактный однострочный макет
const MEDIUM_H    = 75; // px — ниже этой границы: средний макет без project-info
const TIME_COL_W  = 52; // ширина колонки времени
const DAY_CELL_W  = 46; // ФИКСИРОВАННАЯ ширина ячейки в ленте дат
const DAY_CELL_H  = 58; // ФИКСИРОВАННАЯ высота ячейки в ленте дат

/**
 * Час для авто-скролла при открытии (08:00).
 * Скрывает пустые ночные часы 00–07, но оставляет доступными при прокрутке вверх.
 */
const AUTO_SCROLL_HOUR = 8;
/** Запас снизу: задача у 23:00 с длительностью > 60 мин не обрезается. */
const GRID_BUFFER = HOUR_HEIGHT * 2;

/** Минимальная дистанция горизонтального свайпа для срабатывания навигации (px). */
const SWIPE_MIN_DIST = 40;
/** Минимальная скорость горизонтального свайпа (px/ms) — альтернативный триггер. */
const SWIPE_MIN_VX   = 0.4;

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAY_MIN   = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS_RU     = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];
const MONTHS_RU_NOM = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarMode = 'day' | 'week' | 'month';

export interface CalendarEvent {
  task: TodoTask;
  type: 'scheduled' | 'deadline';
  date: Date;
  projectName?: string;
  projectColor?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Диапазон дат текущей недели для шапки WeekView (напр. «16–22 сентября 2024»). */
function fmtWeekRange(weekDays: Date[]): string {
  const first = weekDays[0]!;
  const last  = weekDays[6]!;
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${last.getDate()} ${MONTHS_RU[first.getMonth()]} ${first.getFullYear()}`;
  }
  return (
    `${first.getDate()} ${MONTHS_RU[first.getMonth()]} – ` +
    `${last.getDate()} ${MONTHS_RU[last.getMonth()]} ${last.getFullYear()}`
  );
}

function buildEventsForDay(
  tasks: TodoTask[],
  day: Date,
  projectsMap: Map<string, { name: string; color: string }>,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const task of tasks) {
    const proj = task.project_id ? projectsMap.get(task.project_id) : undefined;
    if (task.schedule_date) {
      const d = new Date(task.schedule_date);
      if (isSameDay(d, day)) {
        events.push({ task, type: 'scheduled', date: d, projectName: proj?.name, projectColor: proj?.color });
      }
    }
    if (task.due_date) {
      const d = new Date(task.due_date);
      if (isSameDay(d, day)) {
        events.push({ task, type: 'deadline', date: d, projectName: proj?.name, projectColor: proj?.color });
      }
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Смещение (px) от верха сетки для заданного времени.
 * Начало сетки = START_HOUR. 1 час = HOUR_HEIGHT px, 1 мин = PX_PER_MIN px.
 *
 * Гарантирует Number-cast, чтобы строки вида "14" не сломали математику.
 */
function timeToY(date: Date): number {
  const h = Math.max(START_HOUR, Math.min(END_HOUR, Number(date.getHours())));
  const m = Math.max(0, Math.min(59, Number(date.getMinutes())));
  return (h - START_HOUR) * HOUR_HEIGHT + m * PX_PER_MIN;
}

/**
 * Высота карточки (px) строго пропорционально длительности без верхних ограничений.
 *   cardHeight = duration_minutes * PX_PER_MIN
 *   (1 мин = 1 px, 30 мин = 30 px, 90 мин = 90 px, ...)
 *
 * Number() cast гарантирует корректность, если backend вернул строку "90".
 * Нижний предел MIN_CARD_H (20 px) — минимум для читаемости 15-минутной задачи.
 * Верхнего предела НЕТ: задача на 120 мин занимает ровно 120 px.
 */
function durationToH(rawMinutes: number | string | null | undefined): number {
  const mins = Number(rawMinutes ?? 30);
  const safe  = isNaN(mins) || mins <= 0 ? 30 : mins;
  return Math.max(MIN_CARD_H, safe * PX_PER_MIN);
}

// ── SwipeableView — горизонтальный жест-детектор ──────────────────────────────
//
// Оборачивает контент и перехватывает ТОЛЬКО горизонтально-доминирующие жесты.
// Вертикальная прокрутка дочерних ScrollView не затрагивается:
//   • onMoveShouldSetPanResponder вернёт true только когда |dx| > |dy| * 1.8,
//     что практически исключает случайный захват вертикального скролла.
//
// useMemo + useCallback гарантируют, что PanResponder пересоздаётся только
// при смене самих колбэков (которые мемоизированы в CalendarView через useCallback).

function SwipeableView({
  onSwipeLeft,
  onSwipeRight,
  children,
  style,
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  children: React.ReactNode;
  style?: object;
}) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Захватываем жест только если горизонтальное смещение явно преобладает
        onMoveShouldSetPanResponder: (_, { dx, dy }) =>
          Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy) * 1.8,
        onPanResponderRelease: (_, { dx, vx }) => {
          if (dx < -SWIPE_MIN_DIST || vx < -SWIPE_MIN_VX) onSwipeLeft();
          else if (dx > SWIPE_MIN_DIST || vx > SWIPE_MIN_VX) onSwipeRight();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSwipeLeft, onSwipeRight],
  );

  return (
    <View style={[{ flex: 1 }, style]} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

// ── ModeSegments ──────────────────────────────────────────────────────────────

function ModeSegments({
  mode,
  onChange,
}: {
  mode: CalendarMode;
  onChange: (m: CalendarMode) => void;
}) {
  const MODES: { key: CalendarMode; label: string }[] = [
    { key: 'day',   label: 'День'   },
    { key: 'week',  label: 'Неделя' },
    { key: 'month', label: 'Месяц'  },
  ];
  return (
    <View style={segStyles.root}>
      {MODES.map(m => (
        <TouchableOpacity
          key={m.key}
          onPress={() => onChange(m.key)}
          activeOpacity={0.8}
          style={[segStyles.btn, mode === m.key && segStyles.btnActive]}
        >
          <Text style={[segStyles.label, mode === m.key && segStyles.labelActive]}>
            {m.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const segStyles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    backgroundColor: CARD,
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 2,
  },
  btn: { flex: 1, paddingVertical: 6, borderRadius: 9, alignItems: 'center' },
  btnActive: { backgroundColor: SCHEDULE_COLOR },
  label: { fontSize: 13, fontWeight: '600', color: TEXT2 },
  labelActive: { color: '#fff' },
});

// ── DayStrip (только для режима «День») ───────────────────────────────────────
//
// Иконка 📅 слева открывает DateTimePicker для быстрого перехода к любой дате.

function DayStrip({
  days,
  today,
  selectedDay,
  onSelect,
  onCalendarPress,
}: {
  days: Date[];
  today: Date;
  selectedDay: Date;
  onSelect: (d: Date) => void;
  /** Открыть DateTimePicker для прыжка к произвольной дате */
  onCalendarPress: () => void;
}) {
  const listRef = useRef<FlatList>(null);

  return (
    <View style={stripStyles.row}>
      {/* Кнопка быстрого пикера дат */}
      <TouchableOpacity
        style={stripStyles.calBtn}
        onPress={onCalendarPress}
        activeOpacity={0.7}
        hitSlop={8}
      >
        <Ionicons name="calendar-outline" size={20} color={TEXT2} />
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={days}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={d => d.toISOString()}
        contentContainerStyle={stripStyles.content}
        style={stripStyles.strip}
        getItemLayout={(_, index) => ({
          length: DAY_CELL_W + 6,
          offset: (DAY_CELL_W + 6) * index,
          index,
        })}
        renderItem={({ item: day }) => {
          const isToday    = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => onSelect(day)}
              style={[
                stripStyles.cell,
                isToday && !isSelected && stripStyles.cellToday,
                isSelected && stripStyles.cellSelected,
              ]}
            >
              {/* Фиксированная ширина — исключает reflow при смене выбранного дня */}
              <Text style={[stripStyles.dayName, isSelected && stripStyles.textSelected]}>
                {WEEKDAY_SHORT[day.getDay()]}
              </Text>
              <Text style={[
                stripStyles.dayNum,
                isToday && !isSelected && stripStyles.dayNumToday,
                isSelected && stripStyles.textSelected,
              ]}>
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const stripStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD },
  calBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  strip: { flex: 1, flexGrow: 1 },
  content: { paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  cell: {
    // Фиксированные размеры → нет скачков при переключении дней
    width: DAY_CELL_W, height: DAY_CELL_H,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  cellToday:    { backgroundColor: 'rgba(10,132,255,0.15)' },
  cellSelected: { backgroundColor: SCHEDULE_COLOR },
  // Текст с фиксированной шириной — исключает reflow
  dayName: { fontSize: 10, fontWeight: '600', color: TEXT2, textAlign: 'center', width: DAY_CELL_W },
  dayNum:  { fontSize: 17, fontWeight: '700', color: TEXT,  textAlign: 'center', width: DAY_CELL_W },
  dayNumToday:  { color: SCHEDULE_COLOR },
  textSelected: { color: '#fff' },
});

// ── DayEventCard — адаптивная карточка для почасовой сетки (режим «День») ─────
//
// Макет зависит от высоты слота (= duration_minutes * PX_PER_MIN):
//
//  < MIN_CARD_H (20 px) — невозможно, MIN_CARD_H гарантирует минимум
//  20 – COMPACT_H (45 px) — «micro»: одна строка, иконка + время + название
//  45 – MEDIUM_H  (75 px) — «compact»: badge в строке с временем, название ниже
//  ≥ 75 px               — «full»: badge + время + название + проект

function DayEventCard({
  event,
  slotHeight,
  onPress,
}: {
  event: CalendarEvent;
  slotHeight: number; // вычисленная высота слота в px
  onPress?: (task: TodoTask) => void;
}) {
  const isDeadline = event.type === 'deadline';
  const accent     = isDeadline ? DEADLINE_COLOR : SCHEDULE_COLOR;
  const icon       = isDeadline ? '🚨' : '🛠️';

  // ── Micro: < COMPACT_H (< ~45 мин) ──────────────────────────────────────
  if (slotHeight < COMPACT_H) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onPress?.(event.task)}
        style={[dc.micro, { borderLeftColor: accent }]}
      >
        <Text style={[dc.microLabel, { color: accent }]} numberOfLines={1}>
          {icon} {fmtTime(event.date)}{'  '}
          <Text style={dc.microTitle}>{event.task.title}</Text>
        </Text>
      </TouchableOpacity>
    );
  }

  // ── Compact: 45–75 px (~45–75 мин) ──────────────────────────────────────
  if (slotHeight < MEDIUM_H) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onPress?.(event.task)}
        style={[dc.compact, { borderLeftColor: accent }]}
      >
        {/* Row 1: badge + time */}
        <View style={dc.compactHeader}>
          <View style={[dc.badge, { backgroundColor: `${accent}22` }]}>
            <Text style={[dc.badgeText, { color: accent }]}>
              {icon} {fmtTime(event.date)}
            </Text>
          </View>
        </View>
        {/* Row 2: title */}
        <Text style={dc.compactTitle} numberOfLines={1}>{event.task.title}</Text>
      </TouchableOpacity>
    );
  }

  // ── Full: ≥ 75 px (~75+ мин) ─────────────────────────────────────────────
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress?.(event.task)}
      style={[dc.full, { borderLeftColor: accent }]}
    >
      <View style={dc.fullHeader}>
        <View style={[dc.badge, { backgroundColor: `${accent}22` }]}>
          <Text style={[dc.badgeText, { color: accent }]}>
            {isDeadline ? '🚨 Дедлайн' : '🛠️ Выполнить'}
          </Text>
        </View>
        <Text style={dc.fullTime}>{fmtTime(event.date)}</Text>
      </View>
      <Text style={dc.fullTitle} numberOfLines={3}>{event.task.title}</Text>
      {event.projectName ? (
        <View style={dc.fullMeta}>
          <View style={[dc.dot, { backgroundColor: event.projectColor ?? '#6366f1' }]} />
          <Text style={dc.projName} numberOfLines={1}>{event.projectName}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const dc = StyleSheet.create({
  // ── Micro (< 45 px) ─────────────────────────────────────────────────────
  micro: {
    flex: 1,
    backgroundColor: CARD2,
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  microLabel: { fontSize: 10, fontWeight: '700', lineHeight: 13 },
  microTitle: { fontSize: 10, fontWeight: '400', color: TEXT },

  // ── Compact (45–75 px) ───────────────────────────────────────────────────
  compact: {
    flex: 1,
    backgroundColor: CARD2,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 3,
    overflow: 'hidden',
  },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactTitle:  { fontSize: 11, fontWeight: '500', color: TEXT, lineHeight: 15 },

  // ── Full (≥ 75 px) ───────────────────────────────────────────────────────
  full: {
    flex: 1,
    backgroundColor: CARD2,
    borderLeftWidth: 3,
    borderRadius: 10,
    padding: 9,
    gap: 4,
    overflow: 'hidden',
  },
  fullHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fullTime:   { fontSize: 11, color: TEXT2, fontWeight: '600', marginLeft: 'auto' },
  fullTitle:  { fontSize: 13, fontWeight: '500', color: TEXT, lineHeight: 18 },
  fullMeta:   { flexDirection: 'row', alignItems: 'center', gap: 5 },

  // ── Shared ───────────────────────────────────────────────────────────────
  badge:     { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  dot:       { width: 6, height: 6, borderRadius: 3 },
  projName:  { fontSize: 11, color: MUTED },
});

// ── EventCard — карточка для Недели и Месяца ──────────────────────────────────

function EventCard({
  event,
  onPress,
  compact = false,
}: {
  event: CalendarEvent;
  onPress?: (task: TodoTask) => void;
  compact?: boolean;
}) {
  const isDeadline = event.type === 'deadline';
  const accent     = isDeadline ? DEADLINE_COLOR : SCHEDULE_COLOR;

  if (compact) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onPress?.(event.task)}
        style={[evStyles.compact, { borderLeftColor: accent }]}
      >
        <Text style={[evStyles.compactTime, { color: accent }]}>{fmtTime(event.date)}</Text>
        <Text style={evStyles.compactTitle} numberOfLines={1}>{event.task.title}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress?.(event.task)}
      style={[evStyles.card, { borderLeftColor: accent }]}
    >
      <View style={evStyles.cardRow}>
        <View style={[evStyles.badge, { backgroundColor: `${accent}22` }]}>
          <Text style={[evStyles.badgeText, { color: accent }]}>
            {isDeadline ? '🚨 Дедлайн' : '🛠️ Выполнить'}
          </Text>
        </View>
        <Text style={evStyles.cardTime}>{fmtTime(event.date)}</Text>
      </View>
      <Text style={evStyles.cardTitle} numberOfLines={2}>{event.task.title}</Text>
      {event.projectName ? (
        <View style={evStyles.cardMeta}>
          <View style={[evStyles.dot, { backgroundColor: event.projectColor ?? '#6366f1' }]} />
          <Text style={evStyles.projName} numberOfLines={1}>{event.projectName}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const evStyles = StyleSheet.create({
  card: {
    backgroundColor: CARD2, borderRadius: 10, borderLeftWidth: 3,
    padding: 9, gap: 4, overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardTime: { fontSize: 11, color: TEXT2, fontWeight: '600', marginLeft: 'auto' },
  cardTitle: { fontSize: 13, fontWeight: '500', color: TEXT, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  projName: { fontSize: 11, color: MUTED },

  compact: {
    backgroundColor: CARD2, borderRadius: 6, borderLeftWidth: 3,
    paddingHorizontal: 6, paddingVertical: 5, gap: 2, overflow: 'hidden',
  },
  compactTime: { fontSize: 9, fontWeight: '700' },
  compactTitle: { fontSize: 11, color: TEXT, fontWeight: '500', lineHeight: 14 },
});

// ── DayView ───────────────────────────────────────────────────────────────────
//
// 24-часовая двухколоночная сетка:
//   • Левая колонка (TIME_COL_W) — метки времени 00:00–23:00.
//   • Правая колонка (flex: 1)   — горизонтальные линии + абсолютные карточки.
//
// Авто-скролл к 08:00 при монтировании: пользователь видит рабочие часы,
// но может прокрутить вверх к ночным (00–07).
//
// Горизонтальный свайп обрабатывается снаружи — через SwipeableView в CalendarView.

function DayView({
  events,
  tabBarHeight,
  onTaskPress,
}: {
  events: CalendarEvent[];
  tabBarHeight: number;
  onTaskPress?: (task: TodoTask) => void;
}) {
  const TOTAL_H  = HOURS.length * HOUR_HEIGHT + GRID_BUFFER;
  const scrollRef = useRef<ScrollView>(null);

  // Авто-скролл к 08:00 после рендера
  useEffect(() => {
    const t = setTimeout(
      () => scrollRef.current?.scrollTo({ y: AUTO_SCROLL_HOUR * HOUR_HEIGHT, animated: false }),
      80,
    );
    return () => clearTimeout(t);
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: tabBarHeight + 80 }}
    >
      <View style={[dayStyles.grid, { height: TOTAL_H }]}>

        {/* ── Левая колонка: метки времени 00:00–23:00 ── */}
        <View style={dayStyles.timeCol}>
          {HOURS.map((hour, idx) => (
            <View key={hour} style={[dayStyles.timeRow, { top: idx * HOUR_HEIGHT }]}>
              <Text style={dayStyles.timeLabel}>{fmtHour(hour)}</Text>
            </View>
          ))}
        </View>

        {/* ── Правая колонка: сетка + события ── */}
        <View style={[dayStyles.eventsCol, { height: TOTAL_H }]}>

          {/* Горизонтальные линии часов (полупрозрачные) */}
          {HOURS.map((hour, idx) => (
            <View key={`line_${hour}`} style={[dayStyles.hourLine, { top: idx * HOUR_HEIGHT }]} />
          ))}

          {/* Подсказка «нет событий» — плавающая внутри сетки */}
          {events.length === 0 && (
            <View style={[dayStyles.noEventsHint, { top: AUTO_SCROLL_HOUR * HOUR_HEIGHT + 24 }]}>
              <Ionicons name="calendar-outline" size={22} color={MUTED} />
              <Text style={dayStyles.noEventsText}>Нет задач · нажми + чтобы добавить</Text>
            </View>
          )}

          {/* Карточки событий — позиционированы по формуле 24h */}
          {events.map((ev, i) => {
            const top        = timeToY(ev.date);
            const slotHeight = durationToH(ev.task.duration_minutes);
            return (
              <View
                key={`${ev.task.id}_${ev.type}_${i}`}
                style={[dayStyles.eventSlot, { top, height: slotHeight }]}
              >
                <DayEventCard event={ev} slotHeight={slotHeight} onPress={onTaskPress} />
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const dayStyles = StyleSheet.create({
  // Двухколоночный контейнер
  grid: { flexDirection: 'row' },

  // Левая колонка — метки времени
  timeCol: { width: TIME_COL_W },
  timeRow: {
    position: 'absolute', left: 0, width: TIME_COL_W, height: HOUR_HEIGHT,
    paddingTop: 4, paddingLeft: 10,
  },
  timeLabel: { fontSize: 11, color: MUTED, fontWeight: '500' },

  // Правая колонка — сетка + события
  eventsCol: {
    flex: 1,
    borderLeftWidth: 0.5,
    borderLeftColor: BORDER,
  },
  hourLine: {
    position: 'absolute', left: 0, right: 0,
    height: 0.5, backgroundColor: BORDER,
  },
  eventSlot: {
    position: 'absolute',
    left:     4,
    right:    8,
  },

  // «Нет событий» — плавает поверх сетки на уровне 08:00
  noEventsHint: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', gap: 6,
  },
  noEventsText: { fontSize: 12, color: MUTED, fontStyle: 'italic' },
});

// ── WeekMiniCard — ультра-компактная карточка для недельной сетки ─────────────
//
// Каждая колонка дня ~ (ширина_экрана - TIME_COL_W) / 7 ≈ 46 px.
// Карточка адаптируется к высоте слота: показывает только то, что помещается.

function WeekMiniCard({
  event,
  slotHeight,
  onPress,
}: {
  event: CalendarEvent;
  slotHeight: number;
  onPress?: (task: TodoTask) => void;
}) {
  const isDeadline = event.type === 'deadline';
  const accent     = isDeadline ? DEADLINE_COLOR : SCHEDULE_COLOR;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress?.(event.task)}
      style={[wmStyles.card, { borderLeftColor: accent, backgroundColor: `${accent}1E` }]}
    >
      {/* Время (если слот ≥ 20 px) */}
      {slotHeight >= 20 && (
        <Text style={[wmStyles.time, { color: accent }]} numberOfLines={1}>
          {fmtTime(event.date)}
        </Text>
      )}
      {/* Название (если слот ≥ 32 px) */}
      {slotHeight >= 32 && (
        <Text style={wmStyles.title} numberOfLines={slotHeight < 56 ? 1 : 2}>
          {event.task.title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const wmStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderLeftWidth: 2,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 2,
    overflow: 'hidden',
    gap: 1,
  },
  time:  { fontSize: 8,  fontWeight: '700', lineHeight: 10 },
  title: { fontSize: 8,  fontWeight: '500', color: TEXT, lineHeight: 10 },
});

// ── WeekView — Google-style 24-часовая таблица с 7 колонками ─────────────────
//
// Структура:
//   • Навигационная строка: ◀ «16–22 сентября 2024» ▶
//   • Зафиксированная шапка (не прокручивается): день-недели + число.
//   • Прокручиваемая сетка (ScrollView):
//       - Левая колонка: метки времени 00:00–23:00.
//       - 7 дневных колонок: горизонтальные линии сетки + карточки событий.
//         Каждая карточка: position: 'absolute', top = timeToY, height = durationToH.
//   • Авто-скролл к 08:00 при открытии.
//   • Горизонтальный свайп → onPrevWeek / onNextWeek.

function WeekView({
  weekDays,
  today,
  allTasks,
  projectsMap,
  tabBarHeight,
  onTaskPress,
  onDayClick,
  onPrevWeek,
  onNextWeek,
}: {
  weekDays: Date[];
  today: Date;
  allTasks: TodoTask[];
  projectsMap: Map<string, { name: string; color: string }>;
  tabBarHeight: number;
  onTaskPress?: (task: TodoTask) => void;
  onDayClick: (d: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  const TOTAL_H  = HOURS.length * HOUR_HEIGHT + GRID_BUFFER;
  const scrollRef = useRef<ScrollView>(null);

  const evsByDay = useMemo(
    () => weekDays.map(d => buildEventsForDay(allTasks, d, projectsMap)),
    [weekDays, allTasks, projectsMap],
  );

  // Авто-скролл к 08:00 при монтировании
  useEffect(() => {
    const t = setTimeout(
      () => scrollRef.current?.scrollTo({ y: AUTO_SCROLL_HOUR * HOUR_HEIGHT, animated: false }),
      80,
    );
    return () => clearTimeout(t);
  }, []);

  return (
    <SwipeableView onSwipeLeft={onNextWeek} onSwipeRight={onPrevWeek}>

      {/* ── Навигационная строка: ◀ диапазон недели ▶ ──────────────────── */}
      <View style={weekStyles.navBar}>
        <TouchableOpacity onPress={onPrevWeek} hitSlop={12} style={weekStyles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={TEXT2} />
        </TouchableOpacity>
        <Text style={weekStyles.navTitle}>{fmtWeekRange(weekDays)}</Text>
        <TouchableOpacity onPress={onNextWeek} hitSlop={12} style={weekStyles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={TEXT2} />
        </TouchableOpacity>
      </View>

      {/* ── Зафиксированная шапка: Пн–Вс + числа ─────────────────────── */}
      <View style={weekStyles.header}>
        {/* Пустой спейсер под колонку времени */}
        <View style={{ width: TIME_COL_W }} />

        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <TouchableOpacity
              key={i}
              onPress={() => onDayClick(day)}
              style={weekStyles.colHeader}
              activeOpacity={0.7}
            >
              <Text style={weekStyles.colDay}>{WEEKDAY_MIN[day.getDay()]}</Text>
              <View style={[weekStyles.colNum, isToday && weekStyles.colNumToday]}>
                <Text style={[weekStyles.colNumText, isToday && weekStyles.colNumTextToday]}>
                  {day.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Прокручиваемая 24-часовая time-grid ─────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 80 }}
      >
        <View style={[weekStyles.gridContainer, { height: TOTAL_H }]}>

          {/* Колонка времени */}
          <View style={weekStyles.timeCol}>
            {HOURS.map((hour, idx) => (
              <View key={hour} style={[weekStyles.timeRow, { top: idx * HOUR_HEIGHT }]}>
                <Text style={weekStyles.timeLabel}>{fmtHour(hour)}</Text>
              </View>
            ))}
          </View>

          {/* 7 дневных колонок */}
          {weekDays.map((day, di) => {
            const evs = evsByDay[di] ?? [];
            return (
              <View key={di} style={[weekStyles.dayCol, { height: TOTAL_H }]}>

                {/* Горизонтальные линии-разделители (тонкие, полупрозрачные) */}
                {HOURS.map((hour, idx) => (
                  <View
                    key={`gl_${hour}`}
                    style={[weekStyles.gridLine, { top: idx * HOUR_HEIGHT }]}
                  />
                ))}

                {/* Карточки событий — те же формулы, что в DayView */}
                {evs.map((ev, ei) => {
                  const top        = timeToY(ev.date);
                  const slotHeight = durationToH(ev.task.duration_minutes);
                  return (
                    <View
                      key={`${ev.task.id}_${ev.type}_${ei}`}
                      style={[weekStyles.eventSlot, { top, height: slotHeight }]}
                    >
                      <WeekMiniCard
                        event={ev}
                        slotHeight={slotHeight}
                        onPress={onTaskPress}
                      />
                    </View>
                  );
                })}

              </View>
            );
          })}
        </View>
      </ScrollView>
    </SwipeableView>
  );
}

const weekStyles = StyleSheet.create({
  // ── Навигационная строка (◀ дата ▶) ───────────────────────────────────────
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  navBtn:   { padding: 4 },
  navTitle: { fontSize: 14, fontWeight: '600', color: TEXT, flex: 1, textAlign: 'center' },

  // Зафиксированная шапка
  header: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 4,
  },
  colHeader: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  colDay:    { fontSize: 10, color: MUTED, fontWeight: '600', textTransform: 'uppercase' },
  colNum:    { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colNumToday:    { backgroundColor: SCHEDULE_COLOR },
  colNumText:     { fontSize: 12, fontWeight: '700', color: TEXT },
  colNumTextToday:{ color: '#fff' },

  // Прокручиваемая сетка
  gridContainer: { flexDirection: 'row' },

  // Колонка времени
  timeCol: { width: TIME_COL_W },
  timeRow: {
    position: 'absolute', left: 0, width: TIME_COL_W, height: HOUR_HEIGHT,
    paddingTop: 3, paddingLeft: 8,
  },
  timeLabel: { fontSize: 10, color: MUTED, fontWeight: '500' },

  // Дневные колонки
  dayCol: {
    flex: 1,
    borderLeftWidth: 0.5,
    borderLeftColor: BORDER,
  },
  // Горизонтальные линии сетки — тонкие, полупрозрачные
  gridLine: {
    position: 'absolute', left: 0, right: 0,
    height: 0.5, backgroundColor: BORDER,
  },
  // Слот события внутри дневной колонки
  eventSlot: {
    position: 'absolute', left: 1, right: 1,
    overflow: 'hidden',
  },
});

// ── MonthView ─────────────────────────────────────────────────────────────────
//
// Логика тапов по дням:
//   • Первый тап по незаполненному дню → setSelectedDay (подсветка + список задач).
//   • Тап по уже выбранному дню → onDayDoubleTap → переключение в режим «День».
// Горизонтальный свайп обрабатывается снаружи через SwipeableView в CalendarView.

function MonthView({
  monthDate,
  today,
  selectedDay,
  allTasks,
  projectsMap,
  tabBarHeight,
  onTaskPress,
  onDaySelect,
  onDayDoubleTap,
  onMonthChange,
}: {
  monthDate: Date;
  today: Date;
  selectedDay: Date;
  allTasks: TodoTask[];
  projectsMap: Map<string, { name: string; color: string }>;
  tabBarHeight: number;
  onTaskPress?: (task: TodoTask) => void;
  /** Первый тап — только выбирает день (подсветка + список задач). */
  onDaySelect: (d: Date) => void;
  /** Повторный тап по уже выбранному дню → перейти в режим «День». */
  onDayDoubleTap: (d: Date) => void;
  onMonthChange: (d: Date) => void;
}) {
  const year  = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const total = daysInMonth(year, month);

  // Смещение: сколько пустых ячеек перед 1-м числом (ISO: Пн = 0)
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: total }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Числа дней, на которые есть события
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    for (const task of allTasks) {
      if (task.schedule_date) {
        const d = new Date(task.schedule_date);
        if (d.getFullYear() === year && d.getMonth() === month)
          set.add(String(d.getDate()));
      }
      if (task.due_date) {
        const d = new Date(task.due_date);
        if (d.getFullYear() === year && d.getMonth() === month)
          set.add(String(d.getDate()));
      }
    }
    return set;
  }, [allTasks, year, month]);

  // Задачи выбранного дня (список под сеткой)
  const selectedEvents = useMemo(
    () => buildEventsForDay(allTasks, selectedDay, projectsMap),
    [allTasks, selectedDay, projectsMap],
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: tabBarHeight + 80 }}
    >
      {/* Навигация по месяцам */}
      <View style={monthStyles.nav}>
        <TouchableOpacity
          onPress={() => onMonthChange(new Date(year, month - 1, 1))}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={20} color={TEXT2} />
        </TouchableOpacity>
        <Text style={monthStyles.navTitle}>{MONTHS_RU_NOM[month]} {year}</Text>
        <TouchableOpacity
          onPress={() => onMonthChange(new Date(year, month + 1, 1))}
          hitSlop={12}
        >
          <Ionicons name="chevron-forward" size={20} color={TEXT2} />
        </TouchableOpacity>
      </View>

      {/* Заголовки дней недели */}
      <View style={monthStyles.weekRow}>
        {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
          <Text key={d} style={monthStyles.weekLabel}>{d}</Text>
        ))}
      </View>

      {/* Сетка месяца */}
      <View style={monthStyles.grid}>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={monthStyles.gridRow}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (!day) return <View key={col} style={monthStyles.emptyCell} />;

              const isToday    = isSameDay(day, today);
              const isSelected = isSameDay(day, selectedDay);
              const hasEvents  = eventDates.has(String(day.getDate()));

              return (
                <TouchableOpacity
                  key={col}
                  // Первый тап — выбирает день. Повторный тап по тому же дню → режим «День».
                  onPress={() => isSameDay(day, selectedDay) ? onDayDoubleTap(day) : onDaySelect(day)}
                  activeOpacity={0.7}
                  style={[
                    monthStyles.dayCell,
                    isSelected && monthStyles.dayCellSelected,
                    isToday && !isSelected && monthStyles.dayCellToday,
                  ]}
                >
                  <Text style={[
                    monthStyles.dayNum,
                    isToday && !isSelected && monthStyles.dayNumToday,
                    isSelected && monthStyles.dayNumSelected,
                  ]}>
                    {day.getDate()}
                  </Text>
                  {hasEvents && (
                    <View style={[monthStyles.dot, isSelected && monthStyles.dotSelected]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Разделитель */}
      <View style={monthStyles.divider} />

      {/* Список задач выбранного дня */}
      <View style={monthStyles.dayEvents}>
        <Text style={monthStyles.dayEventsTitle}>
          {selectedDay.getDate()} {MONTHS_RU[selectedDay.getMonth()]}
          {' · '}
          <Text style={monthStyles.dayEventsCount}>
            {selectedEvents.length > 0
              ? `${selectedEvents.length} событий`
              : 'нет событий'}
          </Text>
        </Text>
        {selectedEvents.length > 0 && (
          <Text style={monthStyles.doubleTapHint}>
            Нажми дважды на выбранный день, чтобы открыть его подробнее
          </Text>
        )}
        {selectedEvents.map((ev, i) => (
          <EventCard
            key={`${ev.task.id}_${ev.type}_${i}`}
            event={ev}
            onPress={onTaskPress}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const monthStyles = StyleSheet.create({
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: TEXT },

  weekRow: { flexDirection: 'row', paddingHorizontal: 8, marginBottom: 4 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED },

  grid: { paddingHorizontal: 8, gap: 2 },
  gridRow: { flexDirection: 'row', gap: 2 },
  emptyCell: { flex: 1, height: 50 },
  dayCell: {
    flex: 1, height: 50, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  dayCellSelected: { backgroundColor: SCHEDULE_COLOR },
  dayCellToday:    { backgroundColor: 'rgba(10,132,255,0.15)' },
  dayNum:          { fontSize: 14, fontWeight: '600', color: TEXT },
  dayNumToday:     { color: SCHEDULE_COLOR },
  dayNumSelected:  { color: '#fff' },
  dot:             { width: 5, height: 5, borderRadius: 2.5, backgroundColor: SCHEDULE_COLOR },
  dotSelected:     { backgroundColor: 'rgba(255,255,255,0.8)' },

  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: BORDER,
    marginHorizontal: 16, marginVertical: 12,
  },
  dayEvents: { paddingHorizontal: 16, gap: 8 },
  dayEventsTitle: { fontSize: 13, fontWeight: '700', color: TEXT2, marginBottom: 4 },
  dayEventsCount: { fontWeight: '400', color: MUTED },
  doubleTapHint: {
    fontSize: 11, color: MUTED, fontStyle: 'italic',
    marginBottom: 4, marginTop: -4,
  },
});

// ── CalendarView (корневой компонент) ─────────────────────────────────────────

export interface CalendarViewProps {
  tasks: TodoTask[];
  projects: TodoProject[];
  tabBarHeight: number;
  onTaskPress?: (task: TodoTask) => void;
}

export function CalendarView({ tasks, projects, tabBarHeight, onTaskPress }: CalendarViewProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [calendarMode,   setCalendarMode]   = useState<CalendarMode>('day');
  const [selectedDay,    setSelectedDay]    = useState<Date>(today);
  const [monthDate,      setMonthDate]      = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 28 дней (4 недели) от понедельника текущей недели
  const days = useMemo<Date[]>(() => {
    const start = startOfIsoWeek(today);
    return Array.from({ length: 28 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [today]);

  // Неделя выбранного дня (для режима «Неделя»)
  const weekDays = useMemo<Date[]>(() => {
    const start = startOfIsoWeek(selectedDay);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [selectedDay]);

  // Map project_id → { name, color }
  const projectsMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    for (const p of projects) m.set(p.id, { name: p.name, color: p.color });
    return m;
  }, [projects]);

  // События для выбранного дня (режим «День»)
  const dayEvents = useMemo(
    () => buildEventsForDay(tasks, selectedDay, projectsMap),
    [tasks, selectedDay, projectsMap],
  );

  // ── Навигация: День ──────────────────────────────────────────────────────

  /** Свайп влево в Day view → следующий день */
  const handleNextDay = useCallback(() => {
    setSelectedDay(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  }, []);
  /** Свайп вправо в Day view → предыдущий день */
  const handlePrevDay = useCallback(() => {
    setSelectedDay(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  }, []);

  // ── Навигация: Неделя ────────────────────────────────────────────────────

  /** Свайп влево или ▶ в Week view → следующая неделя */
  const handleNextWeek = useCallback(() => {
    setSelectedDay(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }, []);
  /** Свайп вправо или ◀ в Week view → предыдущая неделя */
  const handlePrevWeek = useCallback(() => {
    setSelectedDay(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }, []);

  // ── Навигация: Месяц ─────────────────────────────────────────────────────

  /** Свайп влево в Month view → следующий месяц */
  const handleNextMonth = useCallback(() => {
    setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);
  /** Свайп вправо в Month view → предыдущий месяц */
  const handlePrevMonth = useCallback(() => {
    setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);

  // ── Тапы по дням ─────────────────────────────────────────────────────────

  /**
   * Клик по дню в режиме «Неделя» → переключить в «День» для этого дня.
   */
  const handleWeekDayClick = useCallback((d: Date) => {
    setSelectedDay(d);
    setCalendarMode('day');
  }, []);

  /**
   * Первый тап по дню в «Месяце» → только выбрать (подсветить + список задач).
   * Режим НЕ меняется (фикс «телепортации»).
   */
  const handleMonthDaySelect = useCallback((d: Date) => {
    setSelectedDay(d);
  }, []);

  /**
   * Повторный тап по уже выбранному дню в «Месяце» → переход в режим «День».
   */
  const handleMonthDayDoubleTap = useCallback((d: Date) => {
    setSelectedDay(d);
    setCalendarMode('day');
  }, []);

  const dayLabel = `${WEEKDAY_SHORT[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTHS_RU[selectedDay.getMonth()]}`;

  return (
    <View style={rootStyles.root}>

      {/* ── Сегментный переключатель режимов ───────────────────────────── */}
      <ModeSegments mode={calendarMode} onChange={setCalendarMode} />

      {/*
       * ── Лента дат (ТОЛЬКО в режиме «День») ─────────────────────────────
       * В режиме «Неделя» — своя шапка из 7 столбцов + навбар внутри WeekView.
       * В режиме «Месяц» — своя сетка внутри MonthView.
       */}
      {calendarMode === 'day' && (
        <DayStrip
          days={days}
          today={today}
          selectedDay={selectedDay}
          onSelect={d => setSelectedDay(d)}
          onCalendarPress={() => setShowDatePicker(true)}
        />
      )}

      {/* ── Подзаголовок текущего дня (только в режиме «День») ─────────── */}
      {calendarMode === 'day' && (
        <View style={rootStyles.dayHeader}>
          <Text style={rootStyles.dayHeaderText}>{dayLabel}</Text>
          {dayEvents.length > 0 && (
            <View style={rootStyles.countBadge}>
              <Text style={rootStyles.countBadgeText}>{dayEvents.length}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Основной контент ────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>

        {/* Режим «День»: время-сетка обёрнута в SwipeableView для навигации по дням */}
        {calendarMode === 'day' && (
          <SwipeableView onSwipeLeft={handleNextDay} onSwipeRight={handlePrevDay}>
            <DayView
              events={dayEvents}
              tabBarHeight={tabBarHeight}
              onTaskPress={onTaskPress}
            />
          </SwipeableView>
        )}

        {/* Режим «Неделя»: WeekView сам содержит SwipeableView + навбар со стрелками */}
        {calendarMode === 'week' && (
          <WeekView
            weekDays={weekDays}
            today={today}
            allTasks={tasks}
            projectsMap={projectsMap}
            tabBarHeight={tabBarHeight}
            onTaskPress={onTaskPress}
            onDayClick={handleWeekDayClick}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
          />
        )}

        {/* Режим «Месяц»: MonthView обёрнута в SwipeableView для навигации по месяцам */}
        {calendarMode === 'month' && (
          <SwipeableView onSwipeLeft={handleNextMonth} onSwipeRight={handlePrevMonth}>
            <MonthView
              monthDate={monthDate}
              today={today}
              selectedDay={selectedDay}
              allTasks={tasks}
              projectsMap={projectsMap}
              tabBarHeight={tabBarHeight}
              onTaskPress={onTaskPress}
              onDaySelect={handleMonthDaySelect}
              onDayDoubleTap={handleMonthDayDoubleTap}
              onMonthChange={d => {
                setMonthDate(d);
                // При смене месяца выбираем 1-е число нового месяца
                setSelectedDay(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
            />
          </SwipeableView>
        )}
      </View>

      {/*
       * ── Быстрый пикер дат (только в режиме «День») ──────────────────────
       *
       * Android: DateTimePicker рендерится напрямую — нативный диалог появляется
       *          поверх приложения и закрывается после выбора.
       *
       * iOS: DateTimePicker показывается в bottom-sheet Modal с кнопкой «Готово».
       *      display="inline" даёт полноценный встроенный календарь.
       */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedDay}
          mode="date"
          display="default"
          onValueChange={(_event, date) => {
            setShowDatePicker(false);
            setSelectedDay(date);
          }}
          onDismiss={() => setShowDatePicker(false)}
          themeVariant="dark"
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="slide"
          visible={showDatePicker}
          onRequestClose={() => setShowDatePicker(false)}
        >
          {/* Полупрозрачный фон — тап закрывает пикер */}
          <TouchableOpacity
            style={rootStyles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          >
            {/* Bottom-sheet контейнер — тап внутри не закрывает */}
            <View style={rootStyles.pickerSheet} onStartShouldSetResponder={() => true}>
              <View style={rootStyles.pickerHandle} />
              <DateTimePicker
                value={selectedDay}
                mode="date"
                display="inline"
                onValueChange={(_event, date) => {
                  setSelectedDay(date);
                }}
                onDismiss={() => setShowDatePicker(false)}
                themeVariant="dark"
              />
              <TouchableOpacity
                style={rootStyles.pickerDoneBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={rootStyles.pickerDoneText}>Готово</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

// ── Корневые стили ────────────────────────────────────────────────────────────

const rootStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  dayHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
    gap: 8,
  },
  dayHeaderText: { fontSize: 15, fontWeight: '600', color: TEXT, flex: 1 },
  countBadge: {
    backgroundColor: SCHEDULE_COLOR, borderRadius: 10,
    minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // ── DateTimePicker bottom-sheet (iOS) ─────────────────────────────────────
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    alignItems: 'center',
    overflow: 'hidden',
  },
  pickerHandle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    marginTop: 12, marginBottom: 4,
  },
  pickerDoneBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  pickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: SCHEDULE_COLOR,
  },
});
