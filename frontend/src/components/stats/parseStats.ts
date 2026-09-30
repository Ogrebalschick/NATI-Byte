import { gradeTone } from './GradeBadge';

export interface ProgressSubject {
  name: string;
  control_type: string | null;
  grade: string | null;
  points: number | null;
  teacher: string | null;
  attestation: string | null;
  kn1?: unknown;
  kn2?: unknown;
}

export interface ControlWeekBar {
  label: string;
  value: number;
  max: number;
}

export interface BacklogItem {
  subject: string;
  teacher: string | null;
  control_type: string | null;
  status: string | null;
  deadline: string | null;
  semester: string | null;
}

export interface AchievementItem {
  title: string;
  category: string | null;
  date: string | null;
  level: string | null;
  result: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseSubjects(payload: unknown): ProgressSubject[] {
  const root = asRecord(payload);
  return asList(root.subjects)
    .map(item => {
      const row = asRecord(item);
      const name = asString(row.name);
      if (!name) return null;
      return {
        name,
        control_type: asString(row.control_type),
        grade: asString(row.grade),
        points: asNumber(row.points),
        teacher: asString(row.teacher),
        attestation: asString(row.attestation),
        kn1: row.kn1 ?? row.KN1 ?? row.кн1,
        kn2: row.kn2 ?? row.KN2 ?? row.кн2,
      } as ProgressSubject;
    })
    .filter((s): s is ProgressSubject => s != null);
}

export function parseSemester(payload: unknown): string | null {
  return asString(asRecord(payload).semester);
}

export function parseControlWeekLabel(payload: unknown): string | null {
  return asString(asRecord(payload).control_week);
}

function gradeToScore(grade: string | null, points: number | null): number | null {
  if (grade) {
    const tone = gradeTone(grade);
    if (tone === 'five') return 5;
    if (tone === 'four') return 4;
    if (tone === 'three') return 3;
    if (tone === 'fail') return 2;
  }
  if (points == null) return null;
  if (points <= 5) return points;
  if (points <= 100) return Math.min(5, Math.round((points / 20) * 10) / 10);
  return null;
}

export function computeGpa(subjects: ProgressSubject[]): number | null {
  const scores = subjects
    .map(s => gradeToScore(s.grade, s.points))
    .filter((n): n is number => n != null && n > 0);
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 10) / 10;
}

function isPositiveMark(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const s = asString(value)?.toLowerCase();
  if (!s) return false;
  return ['+', 'атт', 'аттестован', 'да', 'yes', '1', 'true', 'зачтено'].some(k => s.includes(k));
}

export function deriveControlWeeks(
  payload: unknown,
  subjects: ProgressSubject[],
): ControlWeekBar[] {
  const root = asRecord(payload);
  const rawWeeks = asList(root.control_weeks);
  if (rawWeeks.length) {
    return rawWeeks
      .map((item, i) => {
        const row = asRecord(item);
        const label = asString(row.name) || asString(row.label) || `КН ${i + 1}`;
        const max = asNumber(row.max) ?? asNumber(row.total) ?? (subjects.length || 1);
        const value =
          asNumber(row.value) ?? asNumber(row.passed) ?? asNumber(row.progress) ?? 0;
        return { label, value, max: max || 1 };
      })
      .filter(w => w.max > 0);
  }

  const kn1 = subjects.filter(s => isPositiveMark(s.kn1)).length;
  const kn2 = subjects.filter(s => isPositiveMark(s.kn2)).length;
  const hasKn = subjects.some(s => s.kn1 != null || s.kn2 != null);
  if (hasKn && subjects.length) {
    return [
      { label: 'Контрольная неделя 1', value: kn1, max: subjects.length },
      { label: 'Контрольная неделя 2', value: kn2, max: subjects.length },
    ];
  }

  const attested = subjects.filter(s => isPositiveMark(s.attestation)).length;
  if (subjects.length && attested > 0) {
    const week = parseControlWeekLabel(payload);
    return [
      {
        label: week ? `Контрольная неделя ${week}` : 'Аттестация',
        value: attested,
        max: subjects.length,
      },
    ];
  }

  const withPoints = subjects.filter(s => s.points != null);
  if (withPoints.length) {
    return withPoints.slice(0, 8).map(s => ({
      label: s.name,
      value: Math.max(0, s.points || 0),
      max: 100,
    }));
  }

  return [];
}

export function parseBacklogs(payload: unknown): BacklogItem[] {
  const root = asRecord(payload);
  return asList(root.backlogs)
    .map(item => {
      const row = asRecord(item);
      const subject = asString(row.subject);
      if (!subject) return null;
      return {
        subject,
        teacher: asString(row.teacher),
        control_type: asString(row.control_type),
        status: asString(row.status),
        deadline: asString(row.deadline),
        semester: asString(row.semester),
      };
    })
    .filter((b): b is BacklogItem => b != null);
}

export function parseAchievements(payload: unknown): AchievementItem[] {
  const root = asRecord(payload);
  return asList(root.achievements)
    .map(item => {
      const row = asRecord(item);
      const title = asString(row.title);
      if (!title) return null;
      return {
        title,
        category: asString(row.category),
        date: asString(row.date),
        level: asString(row.level),
        result: asString(row.result),
      };
    })
    .filter((a): a is AchievementItem => a != null);
}
