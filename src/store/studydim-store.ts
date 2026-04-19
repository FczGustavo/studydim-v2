import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  ambientTracks,
  initialCircles,
  initialJournalEntries,
  initialStudyLogs,
  initialTasks,
  initialTopics,
} from "@/lib/mock-data";
import type {
  AmbientTrack,
  ExtractedSchedule,
  JournalEntry,
  StudyCircle,
  StudyLog,
  StudyTopic,
  Task,
  TimerMode,
} from "@/types/domain";

type AppTab = "focus" | "tasks" | "sound" | "journal" | "settings";

const FOCUS_DURATION = 25 * 60;
const SHORT_BREAK_DURATION = 5 * 60;
const LONG_BREAK_DURATION = 15 * 60;
const LONG_BREAK_EVERY = 4;
const RECALL_INTERVALS = [7, 14, 30] as const;

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);

const DEFAULT_TIMER_DURATIONS = {
  focus: FOCUS_DURATION,
  shortBreak: SHORT_BREAK_DURATION,
  longBreak: LONG_BREAK_DURATION,
};

const modeDuration = (
  mode: TimerMode,
  durations: { focus: number; shortBreak: number; longBreak: number },
): number => {
  if (mode === "focus") return durations.focus;
  if (mode === "shortBreak") return durations.shortBreak;
  return durations.longBreak;
};

const isoDaysFromNow = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

interface StudydimState {
  appTab: AppTab;
  timerMode: TimerMode;
  timerDurations: {
    focus: number;
    shortBreak: number;
    longBreak: number;
  };
  secondsLeft: number;
  timerRunning: boolean;
  focusCyclesCompleted: number;
  modeSwitchedAt?: string;
  customMotivationalPhrase: string;
  dailyRatings: Record<string, number>;
  dailyNotes: Record<string, string>;
  lastTaskRolloverDate: string;

  tasks: Task[];
  studyLogs: StudyLog[];
  topics: StudyTopic[];
  extractedSchedules: ExtractedSchedule[];
  journalEntries: JournalEntry[];
  circles: StudyCircle[];

  ambientTracks: AmbientTrack[];
  currentTrackId: string;
  customSoundUrl: string;

  setTab: (tab: AppTab) => void;
  setTimerMode: (mode: TimerMode) => void;
  updateTimerDurations: (durationsInMinutes: {
    focus: number;
    shortBreak: number;
    longBreak: number;
  }) => void;
  setCustomMotivationalPhrase: (phrase: string) => void;
  setDailyRating: (dateKey: string, rating: number) => void;
  setDailyNote: (dateKey: string, note: string) => void;
  resetAnalytics: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  skipCycle: () => void;
  tick: () => void;

  addTask: (title: string, priority: Task["priority"]) => void;
  toggleTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  rolloverTasksForDate: (dateKey: string) => void;

  setTrack: (youtubeId: string) => void;
  setCustomSoundUrl: (url: string) => void;
  addJournalEntry: (note: string, mood: JournalEntry["mood"]) => void;

  addTopicToRecall: (topicId: string) => void;
  completeRecall: (topicId: string) => void;

  simulateScheduleOCR: (rawText: string) => void;
}

export const useStudydimStore = create<StudydimState>()(
  persist(
    (set, get) => ({
      appTab: "focus",
      timerMode: "focus",
      timerDurations: DEFAULT_TIMER_DURATIONS,
      secondsLeft: FOCUS_DURATION,
      timerRunning: false,
      focusCyclesCompleted: 0,
      modeSwitchedAt: undefined,
      customMotivationalPhrase: "",
      dailyRatings: {},
      dailyNotes: {},
      lastTaskRolloverDate: toDateKey(new Date()),

      tasks: initialTasks,
      studyLogs: initialStudyLogs,
      topics: initialTopics,
      extractedSchedules: [],
      journalEntries: initialJournalEntries,
      circles: initialCircles,

      ambientTracks,
      currentTrackId: ambientTracks[0]?.youtubeId ?? "",
      customSoundUrl: "",

      setTab: (tab) => set({ appTab: tab }),

      setTimerMode: (mode) =>
        set((state) => ({
          timerMode: mode,
          secondsLeft: modeDuration(mode, state.timerDurations),
          timerRunning: false,
          modeSwitchedAt: new Date().toISOString(),
        })),

      updateTimerDurations: (durationsInMinutes) =>
        set((state) => {
          const safeMinutes = {
            focus: Math.max(1, durationsInMinutes.focus),
            shortBreak: Math.max(1, durationsInMinutes.shortBreak),
            longBreak: Math.max(1, durationsInMinutes.longBreak),
          };

          const nextDurations = {
            focus: Math.round(safeMinutes.focus * 60),
            shortBreak: Math.round(safeMinutes.shortBreak * 60),
            longBreak: Math.round(safeMinutes.longBreak * 60),
          };

          return {
            timerDurations: nextDurations,
            secondsLeft: modeDuration(state.timerMode, nextDurations),
            timerRunning: false,
            modeSwitchedAt: new Date().toISOString(),
          };
        }),

      setCustomMotivationalPhrase: (phrase) =>
        set({ customMotivationalPhrase: phrase.trim() }),

      setDailyRating: (dateKey, rating) =>
        set((state) => ({
          dailyRatings: {
            ...state.dailyRatings,
            [dateKey]: Math.max(0, Math.min(10, Math.round(rating))),
          },
        })),

      setDailyNote: (dateKey, note) =>
        set((state) => ({
          dailyNotes: {
            ...state.dailyNotes,
            [dateKey]: note,
          },
        })),

      resetAnalytics: () =>
        set({
          studyLogs: [],
          dailyRatings: {},
          dailyNotes: {},
          focusCyclesCompleted: 0,
        }),

      toggleTimer: () => set((state) => ({ timerRunning: !state.timerRunning })),

      resetTimer: () =>
        set((state) => ({
          timerRunning: false,
          secondsLeft: modeDuration(state.timerMode, state.timerDurations),
        })),

      skipCycle: () =>
        set((state) => {
          const isFocus = state.timerMode === "focus";
          const nextFocusCycles = isFocus
            ? state.focusCyclesCompleted + 1
            : state.focusCyclesCompleted;

          const nextMode: TimerMode = isFocus
            ? nextFocusCycles % LONG_BREAK_EVERY === 0
              ? "longBreak"
              : "shortBreak"
            : "focus";

          return {
            timerMode: nextMode,
            secondsLeft: modeDuration(nextMode, state.timerDurations),
            focusCyclesCompleted: nextFocusCycles,
            modeSwitchedAt: new Date().toISOString(),
          };
        }),

      tick: () => {
        const state = get();
        if (!state.timerRunning) return;

        if (state.secondsLeft > 1) {
          set({ secondsLeft: state.secondsLeft - 1 });
          return;
        }

        const now = new Date().toISOString();
        const isFocus = state.timerMode === "focus";
        const completedCycles = isFocus
          ? state.focusCyclesCompleted + 1
          : state.focusCyclesCompleted;

        const nextMode: TimerMode = isFocus
          ? completedCycles % LONG_BREAK_EVERY === 0
            ? "longBreak"
            : "shortBreak"
          : "focus";

        const completedMinutes = Math.round(
          modeDuration(state.timerMode, state.timerDurations) / 60,
        );

        set({
          timerMode: nextMode,
          secondsLeft: modeDuration(nextMode, state.timerDurations),
          focusCyclesCompleted: completedCycles,
          modeSwitchedAt: now,
          studyLogs: [
            {
              id: `log-${Date.now()}`,
              date: now,
              minutes: completedMinutes,
              focusScore: nextMode === "focus" ? 85 : 65,
              mode: state.timerMode,
            },
            ...state.studyLogs,
          ].slice(0, 180),
        });
      },

      addTask: (title, priority) => {
        const normalized = title.trim();
        if (!normalized) return;

        set((state) => ({
          tasks: [
            {
              id: `task-${Date.now()}`,
              title: normalized,
              completed: false,
              priority,
              createdAt: new Date().toISOString(),
            },
            ...state.tasks,
          ],
        }));
      },

      toggleTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId ? { ...task, completed: !task.completed } : task,
          ),
        })),

      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== taskId),
        })),

      rolloverTasksForDate: (dateKey) =>
        set((state) => {
          if (state.lastTaskRolloverDate === dateKey) return state;

          return {
            tasks: state.tasks.filter((task) => !task.completed),
            lastTaskRolloverDate: dateKey,
          };
        }),

      setTrack: (youtubeId) => set({ currentTrackId: youtubeId }),

      setCustomSoundUrl: (url) => set({ customSoundUrl: url.trim() }),

      addJournalEntry: (note, mood) => {
        const normalized = note.trim();
        if (!normalized) return;

        set((state) => ({
          journalEntries: [
            {
              id: `journal-${Date.now()}`,
              date: new Date().toISOString(),
              note: normalized,
              mood,
            },
            ...state.journalEntries,
          ],
        }));
      },

      addTopicToRecall: (topicId) =>
        set((state) => ({
          topics: state.topics.map((topic) => {
            if (topic.id !== topicId || topic.inRecall) return topic;

            return {
              ...topic,
              inRecall: true,
              recallStage: 1,
              nextReviewAt: isoDaysFromNow(RECALL_INTERVALS[0]),
            };
          }),
        })),

      completeRecall: (topicId) =>
        set((state) => ({
          topics: state.topics.map((topic) => {
            if (topic.id !== topicId || !topic.inRecall) return topic;

            const currentStage = topic.recallStage;
            const nextStage = Math.min(3, currentStage + 1) as StudyTopic["recallStage"];
            const nextInterval =
              RECALL_INTERVALS[Math.max(0, Math.min(RECALL_INTERVALS.length - 1, nextStage - 1))];

            return {
              ...topic,
              recallStage: nextStage,
              lastReviewedAt: new Date().toISOString(),
              nextReviewAt: isoDaysFromNow(nextInterval),
            };
          }),
        })),

      simulateScheduleOCR: (rawText) => {
        const lines = rawText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 8);

        const extracted = lines.map((line, index) => {
          const parts = line.split("-").map((part) => part.trim());
          return {
            title: parts[0] || `Topico ${index + 1}`,
            subject: parts[1] || "Disciplina Geral",
            estimatedMinutes: Number(parts[2]) || 45,
          };
        });

        set((state) => ({
          extractedSchedules: [
            {
              id: `schedule-${Date.now()}`,
              source: "ocr-mock",
              rawText,
              confidence: 0.91,
              createdAt: new Date().toISOString(),
              suggestedTopics: extracted,
            },
            ...state.extractedSchedules,
          ],
          topics: [
            ...state.topics,
            ...extracted.map((topic, index) => ({
              id: `topic-ocr-${Date.now()}-${index}`,
              title: topic.title,
              subject: topic.subject,
              difficulty: "medium" as const,
              inRecall: false,
              recallStage: 0 as const,
            })),
          ],
        }));
      },
    }),
    {
      name: "studydim-local-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        appTab: state.appTab,
        timerMode: state.timerMode,
        timerDurations: state.timerDurations,
        secondsLeft: state.secondsLeft,
        timerRunning: state.timerRunning,
        focusCyclesCompleted: state.focusCyclesCompleted,
        modeSwitchedAt: state.modeSwitchedAt,
        customMotivationalPhrase: state.customMotivationalPhrase,
        dailyRatings: state.dailyRatings,
        dailyNotes: state.dailyNotes,
        lastTaskRolloverDate: state.lastTaskRolloverDate,
        tasks: state.tasks,
        studyLogs: state.studyLogs,
        topics: state.topics,
        extractedSchedules: state.extractedSchedules,
        journalEntries: state.journalEntries,
        circles: state.circles,
        currentTrackId: state.currentTrackId,
        customSoundUrl: state.customSoundUrl,
      }),
    },
  ),
);
