export type TimerMode = "focus" | "shortBreak" | "longBreak";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: "high" | "medium" | "low";
  dueDate?: string;
  createdAt: string;
}

export interface StudyLog {
  id: string;
  date: string;
  minutes: number;
  focusScore: number;
  mode: TimerMode;
}

export interface StudyTopic {
  id: string;
  title: string;
  subject: string;
  difficulty: "low" | "medium" | "high";
  inRecall: boolean;
  recallStage: 0 | 1 | 2 | 3;
  nextReviewAt?: string;
  lastReviewedAt?: string;
}

export interface ExtractedSchedule {
  id: string;
  source: "ocr-mock" | "manual";
  rawText: string;
  confidence: number;
  createdAt: string;
  suggestedTopics: Array<{
    title: string;
    subject: string;
    estimatedMinutes: number;
  }>;
}

export interface JournalEntry {
  id: string;
  date: string;
  note: string;
  mood: "sharp" | "neutral" | "fatigued";
}

export interface StudyCircle {
  id: string;
  name: string;
  members: number;
  mission: string;
  activity: string;
}

export interface ReviewFront {
  id: string;
  title: string;
  detail?: string;
  color: TopicColor;
  checks: {
    weekly: boolean[];
    biweekly: boolean[];
    monthly: boolean[];
  };
}

export type TopicColor = "gray" | "blue" | "green" | "red" | "orange" | "yellow";

export interface ReviewCheckConfig {
  weekly: number;
  biweekly: number;
  monthly: number;
}

export interface ReviewSubject {
  id: string;
  name: string;
  color: string;
  fronts: ReviewFront[];
  order: number;
}

export interface ReviewBlock {
  id: string;
  name: string;
  subjects: ReviewSubject[];
  createdAt: string;
  order: number;
}

export interface AmbientTrack {
  title: string;
  youtubeId: string;
}
