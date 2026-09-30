export type ScoreEntry = {
  id: number;
  subject_id: number;
  score: number;
  description: string | null;
  created_at: string;
};

export type TrackedSubject = {
  id: number;
  user_id: number;
  name: string;
  max_score: number;
  target_score: number;
  is_custom: boolean;
  current_score: number;
  scores: ScoreEntry[];
};

export function sumScores(subject: TrackedSubject): number {
  if (typeof subject.current_score === 'number' && Number.isFinite(subject.current_score)) {
    return subject.current_score;
  }
  return (subject.scores || []).reduce((acc, item) => acc + (Number(item.score) || 0), 0);
}

export function overallProgress(subjects: TrackedSubject[]): { earned: number; max: number; percent: number } {
  const earned = subjects.reduce((acc, item) => acc + sumScores(item), 0);
  const max = subjects.reduce((acc, item) => acc + (Number(item.max_score) || 0), 0);
  const percent = max > 0 ? Math.max(0, Math.min((earned / max) * 100, 999)) : 0;
  return { earned, max, percent };
}
