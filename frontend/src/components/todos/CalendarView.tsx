/**
 * CalendarView — Google Calendar-style task calendar.
 *
 * Три режима:
 *   • День   — двухколоночная почасовая сетка (время слева, карточки справа).
 *              1 минута = 1 px (HOUR_HEIGHT = 60). Карточки занимают всю ширину
 *              правой колонки и абсолютно позиционированы внутри неё.
 *   • Неделя — 7 колонок без дублирующей ленты (DayStrip скрыт).
 *   • Месяц  — сетка месяца; клик по дню ОСТАЁТСЯ в режиме Месяца
 *              (подсветка + список задач внизу, без «телепортации» в День).
 *
 * Лента DayStrip (28 дней) отображается ТОЛЬКО в режиме «День».
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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

const HOURS      = Array.from({ length: 16 }, (_, i) => i + 7); // 07–22
const START_HOUR = HOURS[0]!;  // 7
const END_HOUR   = HOURS[HOURS.length - 1]!; // 22

/**
 * 1 час = 60 px → 1 минута = 1 px.
 * При duration_minutes = 60 карточка займёт ровно 60 px высоты.
 */
const HOUR_HEIGHT = 60; // px per hour
const PX_PER_MIN  = HOUR_HEIGHT / 60; // = 1
const MIN_CARD_H  = 28; // минимальная высота карточки (два ряда текста)
const TIME_COL_W  = 52; // ширина колонки времени
const DAY_CELL_W  = 46; // ФИКСИРОВАННАЯ ширина ячейки в ленте дат
const DAY_CELL_H  = 58; // ФИКСИРОВАННАЯ высота ячейки в ленте дат

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
 * Offset (px) from the top of the grid for a given time.
 * Grid starts at START_HOUR; 1 hour = HOUR_HEIGHT px.
 */
function timeToY(date: Date): number {
  const h = Math.max(START_HOUR, Math.min(END_HOUR, date.getHours()));
  return (h - START_HOUR) * HOUR_HEIGHT + date.getMinutes() * PX_PER_MIN;
}

/**
 * Card height in px.
 * 1 minute = PX_PER_MIN px (= 1 by default).
 * Minimum = MIN_CARD_H px so that even 1-minute tasks are readable.
 */
function durationToH(minutes: number | null | undefined): number {
  const mins = minutes ?? 30;
  return Math.max(MIN_CARD_H, mins * PX_PER_MIN);
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

function DayStrip({
  days,
  today,
  selectedDay,
  onSelect,
}: {
  days: Date[];
  today: Date;
  selectedDay: Date;
  onSelect: (d: Date) => void;
}) {
  const listRef = useRef<FlatList>(null);

  return (
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
  );
}

const stripStyles = StyleSheet.create({
  strip: { flexGrow: 0, backgroundColor: CARD },
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

// ── EventCard (кликабельная карточка события) ─────────────────────────────────

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
  // Full card (Day + Month list)
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

  // Compact card (Week + Month grid cells)
  compact: {
    backgroundColor: CARD2, borderRadius: 6, borderLeftWidth: 3,
    paddingHorizontal: 6, paddingVertical: 5, gap: 2, overflow: 'hidden',
  },
  compactTime: { fontSize: 9, fontWeight: '700' },
  compactTitle: { fontSize: 11, color: TEXT, fontWeight: '500', lineHeight: 14 },
});

// ── DayView ───────────────────────────────────────────────────────────────────
// Фикс: двухколоночный layout — время слева, карточки справа.
// Карточки абсолютно позиционированы ВНУТРИ правой колонки (position: relative),
// поэтому занимают всю её ширину и не «улетают» вправо.

function DayView({
  events,
  tabBarHeight,
  onTaskPress,
}: {
  events: CalendarEvent[];
  tabBarHeight: number;
  onTaskPress?: (task: TodoTask) => void;
}) {
  const TOTAL_H = HOURS.length * HOUR_HEIGHT;

  if (events.length === 0) {
    return (
      <View style={dayStyles.empty}>
        <Ionicons name="calendar-outline" size={54} color={MUTED} />
        <Text style={dayStyles.emptyTitle}>Нет событий</Text>
        <Text style={dayStyles.emptySub}>
          Создай задачу с дедлайном или датой выполнения
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: tabBarHeight + 80 }}
    >
      {/*
       * Двухколоночный контейнер с явной высотой.
       * Левая колонка — фиксированная (TIME_COL_W), правая — flex: 1.
       * Оба столбца имеют одинаковую высоту = TOTAL_H.
       */}
      <View style={[dayStyles.grid, { height: TOTAL_H }]}>

        {/* ── Левая колонка: метки времени ── */}
        <View style={dayStyles.timeCol}>
          {HOURS.map((hour, idx) => (
            <View key={hour} style={[dayStyles.timeRow, { top: idx * HOUR_HEIGHT }]}>
              <Text style={dayStyles.timeLabel}>{fmtHour(hour)}</Text>
            </View>
          ))}
        </View>

        {/*
         * ── Правая колонка: горизонтальные линии + карточки событий ──
         *
         * position: 'relative' (default) + явная высота = TOTAL_H.
         * Все дочерние элементы position: 'absolute' корректно
         * позиционируются внутри этой колонки, занимая её полную ширину
         * (left: 4, right: 4 → без выхода за границы).
         */}
        <View style={[dayStyles.eventsCol, { height: TOTAL_H }]}>

          {/* Горизонтальные разделители часов */}
          {HOURS.map((hour, idx) => (
            <View
              key={`line_${hour}`}
              style={[dayStyles.hourLine, { top: idx * HOUR_HEIGHT }]}
            />
          ))}

          {/* Карточки событий, позиционированные по времени */}
          {events.map((ev, i) => {
            const top    = timeToY(ev.date);
            const height = durationToH(ev.task.duration_minutes);
            return (
              <View
                key={`${ev.task.id}_${ev.type}_${i}`}
                style={[dayStyles.eventSlot, { top, height }]}
              >
                <EventCard event={ev} onPress={onTaskPress} />
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const dayStyles = StyleSheet.create({
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: TEXT2 },
  emptySub: {
    fontSize: 13, color: MUTED, textAlign: 'center', paddingHorizontal: 32, lineHeight: 18,
  },

  // Двухколоночный контейнер
  grid: {
    flexDirection: 'row',
    // height задаётся inline = TOTAL_H
  },

  // Левая колонка: метки времени
  timeCol: {
    width: TIME_COL_W,
    // Дочерние View абсолютно позиционированы
  },
  timeRow: {
    position:   'absolute',
    left:       0,
    width:      TIME_COL_W,
    height:     HOUR_HEIGHT,
    paddingTop: 4,
    paddingLeft: 10,
  },
  timeLabel: {
    fontSize: 11, color: MUTED, fontWeight: '500',
  },

  // Правая колонка: сетка + события
  eventsCol: {
    flex: 1,
    // position: 'relative' — по умолчанию для View; дочерние absolute-элементы
    // позиционируются относительно этого контейнера
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: BORDER,
    paddingRight: 12,
  },
  hourLine: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  eventSlot: {
    // Занимает всю ширину правой колонки (за вычетом paddingRight колонки)
    position: 'absolute',
    left:     4,
    right:    0,
    // top + height задаются inline
    overflow: 'hidden',
  },
});

// ── WeekView ──────────────────────────────────────────────────────────────────
// Фикс: DayStrip не дублируется, т.к. он скрыт в режиме «Неделя».
// WeekView сам рендерит шапку из 7 колонок + тело с задачами.
// Клик по заголовку дня переключает в режим «День» для этого дня.

function WeekView({
  weekDays,
  today,
  allTasks,
  projectsMap,
  tabBarHeight,
  onTaskPress,
  onDayClick,
}: {
  weekDays: Date[];
  today: Date;
  allTasks: TodoTask[];
  projectsMap: Map<string, { name: string; color: string }>;
  tabBarHeight: number;
  onTaskPress?: (task: TodoTask) => void;
  onDayClick: (d: Date) => void; // переход в режим «День»
}) {
  const evsByDay = useMemo(
    () => weekDays.map(d => buildEventsForDay(allTasks, d, projectsMap)),
    [weekDays, allTasks, projectsMap],
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: tabBarHeight + 80 }}
      style={{ flex: 1 }}
    >
      {/* Шапка недели: 7 колонок */}
      <View style={weekStyles.header}>
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

      {/* Тело: 7 колонок с задачами */}
      <View style={weekStyles.body}>
        {evsByDay.map((evs, di) => (
          <View key={di} style={weekStyles.col}>
            {evs.length === 0 ? (
              <View style={weekStyles.colEmpty} />
            ) : (
              evs.map((ev, ei) => (
                <EventCard
                  key={`${ev.task.id}_${ev.type}_${ei}`}
                  event={ev}
                  onPress={onTaskPress}
                  compact
                />
              ))
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const weekStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  colHeader: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 4 },
  colDay: { fontSize: 10, color: MUTED, fontWeight: '600', textTransform: 'uppercase' },
  colNum: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  colNumToday: { backgroundColor: SCHEDULE_COLOR },
  colNumText: { fontSize: 14, fontWeight: '700', color: TEXT },
  colNumTextToday: { color: '#fff' },

  body: { flexDirection: 'row', flex: 1, marginTop: 4 },
  col: {
    flex: 1, padding: 3, gap: 3,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: BORDER,
  },
  colEmpty: { height: 16 },
});

// ── MonthView ─────────────────────────────────────────────────────────────────
// Фикс: клик по дню = selectedDay меняется, но режим НЕ переключается в «День».
// Под сеткой отображается список задач выбранного дня.

function MonthView({
  monthDate,
  today,
  selectedDay,
  allTasks,
  projectsMap,
  tabBarHeight,
  onTaskPress,
  onDaySelect,  // только обновляет selectedDay, не меняет режим
  onMonthChange,
}: {
  monthDate: Date;
  today: Date;
  selectedDay: Date;
  allTasks: TodoTask[];
  projectsMap: Map<string, { name: string; color: string }>;
  tabBarHeight: number;
  onTaskPress?: (task: TodoTask) => void;
  onDaySelect: (d: Date) => void;
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
                  // ↓ Только выбирает день внутри Месяца — НЕ телепортирует в День
                  onPress={() => onDaySelect(day)}
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

  const [calendarMode, setCalendarMode] = useState<CalendarMode>('day');
  const [selectedDay,  setSelectedDay]  = useState<Date>(today);
  const [monthDate,    setMonthDate]    = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

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

  /**
   * Клик по дню в режиме «Неделя» → переключить в «День» для этого дня.
   */
  const handleWeekDayClick = (d: Date) => {
    setSelectedDay(d);
    setCalendarMode('day');
  };

  /**
   * Клик по дню в режиме «Месяц» → только выбрать день (подсветить),
   * режим НЕ меняется (фикс «телепортации»).
   */
  const handleMonthDaySelect = (d: Date) => {
    setSelectedDay(d);
    // monthDate обновляем только если перешли в другой месяц (через стрелки навигации)
  };

  const dayLabel = `${WEEKDAY_SHORT[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTHS_RU[selectedDay.getMonth()]}`;

  return (
    <View style={rootStyles.root}>

      {/* ── Сегментный переключатель режимов ───────────────────────────── */}
      <ModeSegments mode={calendarMode} onChange={setCalendarMode} />

      {/*
       * ── Лента дат (ТОЛЬКО в режиме «День») ─────────────────────────────
       * В режиме «Неделя» — своя шапка из 7 столбцов внутри WeekView.
       * В режиме «Месяц» — своя сетка внутри MonthView.
       */}
      {calendarMode === 'day' && (
        <DayStrip
          days={days}
          today={today}
          selectedDay={selectedDay}
          onSelect={d => setSelectedDay(d)}
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
        {calendarMode === 'day' && (
          <DayView
            events={dayEvents}
            tabBarHeight={tabBarHeight}
            onTaskPress={onTaskPress}
          />
        )}

        {calendarMode === 'week' && (
          <WeekView
            weekDays={weekDays}
            today={today}
            allTasks={tasks}
            projectsMap={projectsMap}
            tabBarHeight={tabBarHeight}
            onTaskPress={onTaskPress}
            onDayClick={handleWeekDayClick}
          />
        )}

        {calendarMode === 'month' && (
          <MonthView
            monthDate={monthDate}
            today={today}
            selectedDay={selectedDay}
            allTasks={tasks}
            projectsMap={projectsMap}
            tabBarHeight={tabBarHeight}
            onTaskPress={onTaskPress}
            onDaySelect={handleMonthDaySelect}
            onMonthChange={d => {
              setMonthDate(d);
              // При смене месяца выбираем 1-е число нового месяца
              setSelectedDay(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
          />
        )}
      </View>
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
});
