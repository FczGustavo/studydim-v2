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

export interface AmbientTrack {
  title: string;
  youtubeId: string;
}
