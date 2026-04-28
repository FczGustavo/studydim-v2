import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  ambientTracks,
  initialCircles,
  initialJournalEntries,
  initialReviewBlocks,
  initialStudyLogs,
  initialTasks,
  initialTopics,
} from "@/lib/mock-data";
import { toLocalDateKey } from "@/lib/date";
import type {
  AmbientTrack,
  ExtractedSchedule,
  JournalEntry,
  ReviewBlock,
  ReviewCheckConfig,
  ReviewFront,
  ReviewSubject,
  StudyCircle,
  StudyLog,
  StudyTopic,
  Task,
  TimerMode,
} from "@/types/domain";

type AppTab = "focus" | "tasks" | "sound" | "journal" | "review" | "settings";
type TimerSystemMode = "pomodoro" | "chronometer";

const FOCUS_DURATION = 25 * 60;
const SHORT_BREAK_DURATION = 5 * 60;
const LONG_BREAK_DURATION = 15 * 60;
const LONG_BREAK_EVERY = 4;
const RECALL_INTERVALS = [7, 14, 30] as const;

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

const DEFAULT_REVIEW_CHECK_CONFIG: ReviewCheckConfig = {
  weekly: 6,
  biweekly: 3,
  monthly: 1,
};

const clampChecklistCount = (value: number): number =>
  Math.max(1, Math.min(12, Math.round(value)));

const normalizeReviewCheckConfig = (
  config?: Partial<ReviewCheckConfig> | null,
): ReviewCheckConfig => ({
  weekly: clampChecklistCount(config?.weekly ?? DEFAULT_REVIEW_CHECK_CONFIG.weekly),
  biweekly: clampChecklistCount(config?.biweekly ?? DEFAULT_REVIEW_CHECK_CONFIG.biweekly),
  monthly: clampChecklistCount(config?.monthly ?? DEFAULT_REVIEW_CHECK_CONFIG.monthly),
});

const resizeChecklist = (values: boolean[] | undefined, size: number): boolean[] => {
  const source = Array.isArray(values) ? values : [];
  return Array.from({ length: size }, (_, index) => Boolean(source[index]));
};

const normalizeFrontChecks = (
  checks: ReviewFront["checks"] | { weekly?: boolean | boolean[]; biweekly?: boolean | boolean[]; monthly?: boolean | boolean[] } | undefined,
  config: ReviewCheckConfig,
): ReviewFront["checks"] => {
  const toArray = (value: boolean | boolean[] | undefined): boolean[] => {
    if (Array.isArray(value)) return value.map(Boolean);
    if (typeof value === "boolean") return [value];
    return [];
  };

  return {
    weekly: resizeChecklist(toArray(checks?.weekly), config.weekly),
    biweekly: resizeChecklist(toArray(checks?.biweekly), config.biweekly),
    monthly: resizeChecklist(toArray(checks?.monthly), config.monthly),
  };
};

const ensureTopicSubject = (subjects: ReviewSubject[] | undefined, blockId: string): ReviewSubject => {
  if (subjects?.[0]) {
    return {
      ...subjects[0],
      name: "Topics",
      order: 0,
      fronts: [...subjects[0].fronts],
    };
  }

  return {
    id: `topic-subj-${blockId}`,
    name: "Topics",
    color: "#3B82F6",
    fronts: [],
    order: 0,
  };
};

const normalizeReviewBlocks = (
  reviewBlocks: ReviewBlock[] | undefined,
  checkConfig: ReviewCheckConfig,
): ReviewBlock[] => {
  if (!Array.isArray(reviewBlocks)) return initialReviewBlocks;

  return reviewBlocks.map((block, blockIndex) => {
    const combinedFronts = (block.subjects ?? []).flatMap((subject) => subject.fronts ?? []);
    const topicSubject = ensureTopicSubject(block.subjects, block.id);

    topicSubject.fronts = combinedFronts.map((front, frontIndex) => ({
      ...front,
      id: front.id || `front-${block.id}-${frontIndex}`,
      checks: normalizeFrontChecks(front.checks, checkConfig),
    }));

    return {
      ...block,
      order: typeof block.order === "number" ? block.order : blockIndex,
      subjects: [{ ...topicSubject, order: 0 }],
    };
  });
};

interface StudydimState {
  appTab: AppTab;
  timerSystemMode: TimerSystemMode;
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
  reviewBlocks: ReviewBlock[];
  reviewCheckConfig: ReviewCheckConfig;

  ambientTracks: AmbientTrack[];
  currentTrackId: string;
  customSoundUrl: string;

  setTab: (tab: AppTab) => void;
  setTimerSystemMode: (mode: TimerSystemMode) => void;
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
  advanceTimerBy: (elapsedSeconds: number) => void;
  tick: () => void;

  addTask: (title: string, priority: Task["priority"]) => void;
  toggleTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  rolloverTasksForDate: (dateKey: string) => void;
  logFocusMinutes: (minutes: number) => void;

  setTrack: (youtubeId: string) => void;
  setCustomSoundUrl: (url: string) => void;
  addJournalEntry: (note: string, mood: JournalEntry["mood"]) => void;

  addTopicToRecall: (topicId: string) => void;
  completeRecall: (topicId: string) => void;

  simulateScheduleOCR: (rawText: string) => void;

  addReviewBlock: () => void;
  removeReviewBlock: (blockId: string) => void;
  updateReviewBlockName: (blockId: string, name: string) => void;
  setReviewCheckConfig: (config: ReviewCheckConfig) => void;
  addTopicToBlock: (blockId: string, title: string) => void;
  removeTopicFromBlock: (blockId: string, frontId: string) => void;
  toggleTopicCheck: (blockId: string, frontId: string, period: "weekly" | "biweekly" | "monthly", index: number) => void;
  moveTopicInBlock: (blockId: string, fromIndex: number, toIndex: number) => void;
  addSubjectToBlock: (blockId: string, name: string, color: string) => void;
  removeSubjectFromBlock: (blockId: string, subjectId: string) => void;
  addFrontToSubject: (blockId: string, subjectId: string, title: string) => void;
  removeFrontFromSubject: (blockId: string, subjectId: string, frontId: string) => void;
  toggleFrontCheck: (blockId: string, subjectId: string, frontId: string, period: "weekly" | "biweekly" | "monthly") => void;
}

export const useStudydimStore = create<StudydimState>()(
  persist(
    (set, get) => ({
      appTab: "focus",
      timerSystemMode: "pomodoro",
      timerMode: "focus",
      timerDurations: DEFAULT_TIMER_DURATIONS,
      secondsLeft: FOCUS_DURATION,
      timerRunning: false,
      focusCyclesCompleted: 0,
      modeSwitchedAt: undefined,
      customMotivationalPhrase: "",
      dailyRatings: {},
      dailyNotes: {},
      lastTaskRolloverDate: toLocalDateKey(new Date()),

      tasks: initialTasks,
      studyLogs: initialStudyLogs,
      topics: initialTopics,
      extractedSchedules: [],
      journalEntries: initialJournalEntries,
      circles: initialCircles,
      reviewBlocks: normalizeReviewBlocks(initialReviewBlocks, DEFAULT_REVIEW_CHECK_CONFIG),
      reviewCheckConfig: DEFAULT_REVIEW_CHECK_CONFIG,

      ambientTracks,
      currentTrackId: "",
      customSoundUrl: "",

      setTab: (tab) => set({ appTab: tab }),

      setTimerSystemMode: (mode) =>
        set({
          timerSystemMode: mode,
          timerRunning: false,
        }),

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

      advanceTimerBy: (elapsedSeconds) =>
        set((state) => {
          if (!state.timerRunning) return state;

          const elapsed = Number.isFinite(elapsedSeconds)
            ? Math.max(0, Math.floor(elapsedSeconds))
            : 0;

          if (elapsed <= 0) return state;

          let remaining = elapsed;
          let secondsLeft = state.secondsLeft;
          let timerMode = state.timerMode;
          let focusCyclesCompleted = state.focusCyclesCompleted;
          let studyLogs = state.studyLogs;
          let modeSwitchedAt = state.modeSwitchedAt;

          while (remaining > 0) {
            if (secondsLeft > remaining) {
              secondsLeft -= remaining;
              remaining = 0;
              break;
            }

            remaining -= secondsLeft;

            const now = new Date().toISOString();
            const isFocus = timerMode === "focus";
            const completedCycles = isFocus
              ? focusCyclesCompleted + 1
              : focusCyclesCompleted;

            const nextMode: TimerMode = isFocus
              ? completedCycles % LONG_BREAK_EVERY === 0
                ? "longBreak"
                : "shortBreak"
              : "focus";

            const completedMinutes = Math.round(
              modeDuration(timerMode, state.timerDurations) / 60,
            );

            studyLogs = [
              {
                id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                date: now,
                minutes: completedMinutes,
                focusScore: nextMode === "focus" ? 85 : 65,
                mode: timerMode,
              },
              ...studyLogs,
            ].slice(0, 180);

            timerMode = nextMode;
            secondsLeft = modeDuration(nextMode, state.timerDurations);
            focusCyclesCompleted = completedCycles;
            modeSwitchedAt = now;
          }

          return {
            timerMode,
            secondsLeft,
            focusCyclesCompleted,
            modeSwitchedAt,
            studyLogs,
          };
        }),

      tick: () => {
        get().advanceTimerBy(1);
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

      logFocusMinutes: (minutes) =>
        set((state) => {
          const safeMinutes = Math.max(0, Math.round(minutes));
          if (safeMinutes <= 0) return state;

          const newLog: StudyLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: new Date().toISOString(),
            minutes: safeMinutes,
            focusScore: 85,
            mode: "focus",
          };

          return {
            studyLogs: [newLog, ...state.studyLogs].slice(0, 180),
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

      addReviewBlock: () =>
        set((state) => ({
          reviewBlocks: [
            ...state.reviewBlocks,
            {
              id: `block-${Date.now()}`,
              name: `Block ${String(state.reviewBlocks.length + 1).padStart(2, "0")}`,
              subjects: [],
              createdAt: new Date().toISOString(),
              order: state.reviewBlocks.length,
            },
          ],
        })),

      removeReviewBlock: (blockId) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.filter((b) => b.id !== blockId),
        })),

      updateReviewBlockName: (blockId, name) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((b) =>
            b.id === blockId ? { ...b, name } : b,
          ),
        })),

      setReviewCheckConfig: (config) =>
        set((state) => {
          const normalizedConfig = normalizeReviewCheckConfig(config);
          return {
            reviewCheckConfig: normalizedConfig,
            reviewBlocks: state.reviewBlocks.map((block) => ({
              ...block,
              subjects: block.subjects.map((subject) => ({
                ...subject,
                fronts: subject.fronts.map((front) => ({
                  ...front,
                  checks: normalizeFrontChecks(front.checks, normalizedConfig),
                })),
              })),
            })),
          };
        }),

      addTopicToBlock: (blockId, title) => {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) return;

        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            const subject = ensureTopicSubject(block.subjects, block.id);
            return {
              ...block,
              subjects: [
                {
                  ...subject,
                  fronts: [
                    ...subject.fronts,
                    {
                      id: `front-${Date.now()}`,
                      title: normalizedTitle,
                      checks: normalizeFrontChecks(undefined, state.reviewCheckConfig),
                    },
                  ],
                },
              ],
            };
          }),
        }));
      },

      removeTopicFromBlock: (blockId, frontId) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            const subject = ensureTopicSubject(block.subjects, block.id);
            return {
              ...block,
              subjects: [
                {
                  ...subject,
                  fronts: subject.fronts.filter((front) => front.id !== frontId),
                },
              ],
            };
          }),
        })),

      toggleTopicCheck: (blockId, frontId, period, index) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            const subject = ensureTopicSubject(block.subjects, block.id);
            return {
              ...block,
              subjects: [
                {
                  ...subject,
                  fronts: subject.fronts.map((front) => {
                    if (front.id !== frontId) return front;
                    const nextPeriod = [...front.checks[period]];
                    if (index < 0 || index >= nextPeriod.length) return front;
                    nextPeriod[index] = !nextPeriod[index];
                    return {
                      ...front,
                      checks: {
                        ...front.checks,
                        [period]: nextPeriod,
                      },
                    };
                  }),
                },
              ],
            };
          }),
        })),

      moveTopicInBlock: (blockId, fromIndex, toIndex) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            const subject = ensureTopicSubject(block.subjects, block.id);
            const fronts = [...subject.fronts];
            if (
              fromIndex < 0
              || toIndex < 0
              || fromIndex >= fronts.length
              || toIndex >= fronts.length
              || fromIndex === toIndex
            ) {
              return { ...block, subjects: [subject] };
            }
            const [moved] = fronts.splice(fromIndex, 1);
            fronts.splice(toIndex, 0, moved);
            return {
              ...block,
              subjects: [{ ...subject, fronts }],
            };
          }),
        })),

      addSubjectToBlock: (blockId, name, color) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            const newSubject: ReviewSubject = {
              id: `subj-${Date.now()}`,
              name,
              color,
              fronts: [],
              order: block.subjects.length,
            };
            return { ...block, subjects: [...block.subjects, newSubject] };
          }),
        })),

      removeSubjectFromBlock: (blockId, subjectId) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) =>
            block.id !== blockId
              ? block
              : { ...block, subjects: block.subjects.filter((s) => s.id !== subjectId) },
          ),
        })),

      addFrontToSubject: (blockId, subjectId, title) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            return {
              ...block,
              subjects: block.subjects.map((s) => {
                if (s.id !== subjectId) return s;
                return {
                  ...s,
                  fronts: [
                    ...s.fronts,
                    {
                      id: `front-${Date.now()}`,
                      title,
                      checks: normalizeFrontChecks(undefined, state.reviewCheckConfig),
                    },
                  ],
                };
              }),
            };
          }),
        })),

      removeFrontFromSubject: (blockId, subjectId, frontId) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            return {
              ...block,
              subjects: block.subjects.map((s) => {
                if (s.id !== subjectId) return s;
                return { ...s, fronts: s.fronts.filter((f) => f.id !== frontId) };
              }),
            };
          }),
        })),

      toggleFrontCheck: (blockId, subjectId, frontId, period) =>
        set((state) => ({
          reviewBlocks: state.reviewBlocks.map((block) => {
            if (block.id !== blockId) return block;
            return {
              ...block,
              subjects: block.subjects.map((s) => {
                if (s.id !== subjectId) return s;
                return {
                  ...s,
                  fronts: s.fronts.map((f) => {
                    if (f.id !== frontId) return f;
                    const values = [...f.checks[period]];
                    if (values.length > 0) values[0] = !values[0];
                    return { ...f, checks: { ...f.checks, [period]: values } };
                  }),
                };
              }),
            };
          }),
        })),
    }),
    {
      name: "studydim-local-state",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState;

        const state = persistedState as StudydimState & { reviewCheckConfig?: Partial<ReviewCheckConfig> };
        const normalizedConfig = normalizeReviewCheckConfig(state.reviewCheckConfig);
        return {
          ...state,
          reviewCheckConfig: normalizedConfig,
          reviewBlocks: normalizeReviewBlocks(state.reviewBlocks, normalizedConfig),
        };
      },
      partialize: (state) => ({
        appTab: state.appTab,
        timerSystemMode: state.timerSystemMode,
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
        reviewBlocks: state.reviewBlocks,
        reviewCheckConfig: state.reviewCheckConfig,
        currentTrackId: state.currentTrackId,
        customSoundUrl: state.customSoundUrl,
      }),
    },
  ),
);
