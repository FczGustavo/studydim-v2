import type {
  AmbientTrack,
  JournalEntry,
  ReviewBlock,
  StudyCircle,
  StudyLog,
  StudyTopic,
  Task,
} from "@/types/domain";

const now = new Date();

export const initialTasks: Task[] = [
  {
    id: "task-1",
    title: "Revisar cinematica naval",
    completed: false,
    priority: "high",
    dueDate: new Date(now.getTime() + 86_400_000).toISOString(),
    createdAt: now.toISOString(),
  },
  {
    id: "task-2",
    title: "Resolver lista de trigonometria",
    completed: false,
    priority: "medium",
    createdAt: now.toISOString(),
  },
  {
    id: "task-3",
    title: "Resumo rapido de fisica termica",
    completed: true,
    priority: "low",
    createdAt: new Date(now.getTime() - 172_800_000).toISOString(),
  },
];

export const initialStudyLogs: StudyLog[] = Array.from({ length: 40 }, (_, index) => {
  const date = new Date(now);
  date.setDate(now.getDate() - index);
  const minutes = index % 4 === 0 ? 0 : 25 + ((index * 11) % 60);

  return {
    id: `log-${index}`,
    date: date.toISOString(),
    minutes,
    focusScore: Math.min(100, Math.max(45, 58 + ((index * 7) % 32))),
    mode: index % 5 === 0 ? "shortBreak" : "focus",
  };
});

export const initialTopics: StudyTopic[] = [
  {
    id: "topic-1",
    title: "Navegacao costeira e cartas nauticas",
    subject: "Navegacao",
    difficulty: "high",
    inRecall: true,
    recallStage: 1,
    nextReviewAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    lastReviewedAt: new Date(now.getTime() - 1 * 86_400_000).toISOString(),
  },
  {
    id: "topic-2",
    title: "Termodinamica aplicada",
    subject: "Fisica",
    difficulty: "medium",
    inRecall: false,
    recallStage: 0,
  },
  {
    id: "topic-3",
    title: "Funcoes e inequacoes",
    subject: "Matematica",
    difficulty: "high",
    inRecall: true,
    recallStage: 2,
    nextReviewAt: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
    lastReviewedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
  },
];

export const initialJournalEntries: JournalEntry[] = [
  {
    id: "journal-1",
    date: now.toISOString(),
    note: "Bloco de foco forte pela manha, sem uso de celular entre 06h e 11h.",
    mood: "sharp",
  },
  {
    id: "journal-2",
    date: new Date(now.getTime() - 86_400_000).toISOString(),
    note: "Queda de energia no fim do dia. Ajustar pausas para reduzir fadiga.",
    mood: "fatigued",
  },
];

export const initialCircles: StudyCircle[] = [
  {
    id: "circle-1",
    name: "Esquadrao Alfa",
    members: 12,
    mission: "Sprint de Navegacao por 21 dias",
    activity: "4 membros concluindo revisao hoje",
  },
  {
    id: "circle-2",
    name: "Batalhao Litoral",
    members: 8,
    mission: "Matematica sem lacunas",
    activity: "Desafio aberto: 90 min sem interrupcao",
  },
];

export const ambientTracks: AmbientTrack[] = [
  { title: "Dark Academia", youtubeId: "rCmQJfAzwEQ" },
  { title: "Rainy Day In The Forest", youtubeId: "sa61rE36264" },
  { title: "Dark Academia Piano", youtubeId: "SllpB3W5f6s" },
];

export const initialReviewBlocks: ReviewBlock[] = [
  {
    id: "block-1",
    name: "Block 01",
    subjects: [
      {
        id: "subj-1-1",
        name: "Topics",
        color: "#3B82F6",
        fronts: [
          { id: "front-1-1-1", title: "Number Sets", color: "blue", checks: { weekly: Array.from({ length: 6 }, () => false), biweekly: Array.from({ length: 3 }, () => false), monthly: [false] } },
          { id: "front-1-1-2", title: "Functions & Relations", color: "green", checks: { weekly: Array.from({ length: 6 }, () => false), biweekly: Array.from({ length: 3 }, () => false), monthly: [false] } },
          { id: "front-1-1-3", title: "Uniform Motion", color: "orange", checks: { weekly: Array.from({ length: 6 }, () => false), biweekly: Array.from({ length: 3 }, () => false), monthly: [false] } },
          { id: "front-1-1-4", title: "Word Formation", color: "yellow", checks: { weekly: Array.from({ length: 6 }, () => false), biweekly: Array.from({ length: 3 }, () => false), monthly: [false] } },
        ],
        order: 0,
      },
    ],
    createdAt: now.toISOString(),
    order: 0,
  },
];
