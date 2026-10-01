/**
 * CalendarView — Google Calendar-style day view for the task manager.
 *
 * Shows a horizontal 28-day strip + a vertical hourly grid (07:00–22:00).
 * Each task appears as a coloured card:
 *   🛠️  blue  — via schedule_date (планируемое время работы)
 *   🚨  red   — via due_date      (дедлайн / крайний срок)
 *
 * If a task has BOTH dates and they fall on the selected day, it is shown
 * TWICE — once in each slot — so the student sees both events.
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

const BG      = '#17161B';
const CARD    = '#1C1C1E';
const CARD2   = '#232228';
const BORDER  = '#2C2C2E';
const MUTED   = '#636366';
const TEXT    = '#EBEBF5';
const TEXT2   = '#8E8E93';

const SCHEDULE_COLOR = '#0A84FF'; // blue  — "когда делаю"
const DEADLINE_COLOR = '#FF453A'; // red   — "когда сдавать"

// ── Calendar constants ────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07 – 22
const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS_RU = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  task: TodoTask;
  /** scheduled = 🛠️ when student plans to work; deadline = 🚨 hard due date */
  type: 'scheduled' | 'deadline';
  date: Date;
  projectName?: string;
  projectColor?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Returns the Monday of the ISO week containing `date`. */
function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Collect all CalendarEvents for a specific day from all tasks. */
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
        events.push({
          task,
          type: 'scheduled',
          date: d,
          projectName: proj?.name,
          projectColor: proj?.color,
        });
      }
    }

    if (task.due_date) {
      const d = new Date(task.due_date);
      if (isSameDay(d, day)) {
        events.push({
          task,
          type: 'deadline',
          date: d,
          projectName: proj?.name,
          projectColor: proj?.color,
        });
      }
    }
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Clamp an hour to the visible range. */
function hourSlot(date: Date): number {
  const h = date.getHours();
  if (h < HOURS[0]) return HOURS[0];
  if (h > HOURS[HOURS.length - 1]) return HOURS[HOURS.length - 1];
  return h;
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: CalendarEvent }) {
  const isDeadline = event.type === 'deadline';
  const accent = isDeadline ? DEADLINE_COLOR : SCHEDULE_COLOR;

  return (
    <View style={[styles.eventCard, { borderLeftColor: accent }]}>
      <View style={styles.eventRow}>
        <View style={[styles.eventBadge, { backgroundColor: `${accent}22` }]}>
          <Text style={[styles.eventBadgeText, { color: accent }]}>
            {isDeadline ? '🚨 Дедлайн' : '🛠️ Выполнить'}
          </Text>
        </View>
        <Text style={styles.eventTime}>{fmtTime(event.date)}</Text>
      </View>

      <Text style={styles.eventTitle} numberOfLines={2}>
        {event.task.title}
      </Text>

      {event.projectName ? (
        <View style={styles.eventMeta}>
          <View
            style={[
              styles.eventProjectDot,
              { backgroundColor: event.projectColor ?? '#6366f1' },
            ]}
          />
          <Text style={styles.eventProjectName} numberOfLines={1}>
            {event.projectName}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── HourRow ───────────────────────────────────────────────────────────────────

function HourRow({
  hour,
  events,
  isLast,
}: {
  hour: number;
  events: CalendarEvent[];
  isLast: boolean;
}) {
  const hasEvents = events.length > 0;

  return (
    <View style={[styles.hourRow, !isLast && styles.hourRowBorder]}>
      {/* Time label */}
      <Text style={[styles.hourLabel, hasEvents && styles.hourLabelActive]}>
        {fmtHour(hour)}
      </Text>

      {/* Vertical divider */}
      <View style={[styles.hourLine, hasEvents && styles.hourLineActive]} />

      {/* Event cards */}
      <View style={styles.hourContent}>
        {events.map((ev, i) => (
          <EventCard key={`${ev.task.id}_${ev.type}_${i}`} event={ev} />
        ))}
      </View>
    </View>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

export interface CalendarViewProps {
  tasks: TodoTask[];
  projects: TodoProject[];
  tabBarHeight: number;
}

export function CalendarView({ tasks, projects, tabBarHeight }: CalendarViewProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedDay, setSelectedDay] = useState<Date>(today);

  // 28 days starting from Monday of current week
  const days = useMemo<Date[]>(() => {
    const start = startOfIsoWeek(today);
    return Array.from({ length: 28 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [today]);

  // Map project_id → { name, color } for fast lookup
  const projectsMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    for (const p of projects) {
      m.set(p.id, { name: p.name, color: p.color });
    }
    return m;
  }, [projects]);

  // Events for the selected day
  const dayEvents = useMemo(
    () => buildEventsForDay(tasks, selectedDay, projectsMap),
    [tasks, selectedDay, projectsMap],
  );

  // Group events by hour slot
  const byHour = useMemo(() => {
    const m = new Map<number, CalendarEvent[]>(HOURS.map(h => [h, []]));
    for (const ev of dayEvents) {
      const h = hourSlot(ev.date);
      m.set(h, [...(m.get(h) ?? []), ev]);
    }
    return m;
  }, [dayEvents]);

  // Scroll to today's chip on mount
  const stripRef = useRef<FlatList>(null);

  const dayLabel = `${WEEKDAY_SHORT[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTHS_RU[selectedDay.getMonth()]}`;

  return (
    <View style={styles.root}>
      {/* ── Day strip ──────────────────────────────────────────────────── */}
      <FlatList
        ref={stripRef}
        data={days}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={d => d.toISOString()}
        contentContainerStyle={styles.stripContent}
        style={styles.strip}
        renderItem={({ item: day }) => {
          const isToday    = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);

          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setSelectedDay(day)}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                isToday && !isSelected && styles.dayCellToday,
              ]}
            >
              <Text
                style={[
                  styles.dayName,
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {WEEKDAY_SHORT[day.getDay()]}
              </Text>
              <Text
                style={[
                  styles.dayNum,
                  isToday && !isSelected && styles.dayNumToday,
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Day header ─────────────────────────────────────────────────── */}
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText}>{dayLabel}</Text>
        {dayEvents.length > 0 && (
          <View style={styles.eventCountBadge}>
            <Text style={styles.eventCountText}>{dayEvents.length}</Text>
          </View>
        )}
      </View>

      {/* ── Hourly grid ────────────────────────────────────────────────── */}
      {dayEvents.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={54} color={MUTED} />
          <Text style={styles.emptyTitle}>Нет событий</Text>
          <Text style={styles.emptySub}>
            Создай задачу с дедлайном или датой выполнения
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 80 }}
        >
          {HOURS.map((hour, idx) => (
            <HourRow
              key={hour}
              hour={hour}
              events={byHour.get(hour) ?? []}
              isLast={idx === HOURS.length - 1}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // ── Day strip ──────────────────────────────────────────────────────────────
  strip: { flexGrow: 0, backgroundColor: CARD },
  stripContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 6 },
  dayCell: {
    width: 42,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    gap: 2,
  },
  dayCellSelected: { backgroundColor: '#0A84FF' },
  dayCellToday: { backgroundColor: 'rgba(10,132,255,0.15)' },
  dayName: { fontSize: 10, fontWeight: '600', color: TEXT2 },
  dayNum: { fontSize: 16, fontWeight: '700', color: TEXT },
  dayNumToday: { color: '#0A84FF' },
  dayTextSelected: { color: '#fff' },

  // ── Day header ─────────────────────────────────────────────────────────────
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    gap: 8,
  },
  dayHeaderText: { fontSize: 15, fontWeight: '600', color: TEXT, flex: 1 },
  eventCountBadge: {
    backgroundColor: '#0A84FF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  eventCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // ── Empty state ────────────────────────────────────────────────────────────
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: TEXT2 },
  emptySub: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 18,
  },

  // ── Hour row ───────────────────────────────────────────────────────────────
  hourRow: {
    flexDirection: 'row',
    minHeight: 52,
    paddingVertical: 6,
    paddingRight: 12,
  },
  hourRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  hourLabel: {
    width: 48,
    paddingLeft: 12,
    fontSize: 11,
    color: MUTED,
    fontWeight: '500',
    lineHeight: 20,
  },
  hourLabelActive: { color: TEXT2 },
  hourLine: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginRight: 10,
    marginTop: 2,
  },
  hourLineActive: { backgroundColor: '#3A3A3C' },
  hourContent: { flex: 1, gap: 6 },

  // ── Event card ─────────────────────────────────────────────────────────────
  eventCard: {
    backgroundColor: CARD2,
    borderRadius: 10,
    borderLeftWidth: 3,
    padding: 9,
    gap: 4,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventBadge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  eventBadgeText: { fontSize: 10, fontWeight: '700' },
  eventTime: { fontSize: 11, color: TEXT2, fontWeight: '600', marginLeft: 'auto' },
  eventTitle: { fontSize: 13, fontWeight: '500', color: TEXT, lineHeight: 18 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventProjectDot: { width: 6, height: 6, borderRadius: 3 },
  eventProjectName: { fontSize: 11, color: MUTED },
});
