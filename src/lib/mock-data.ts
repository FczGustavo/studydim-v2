import type {
  AmbientTrack,
  JournalEntry,
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
  { title: "Radar Rain - LoFi Ops", youtubeId: "5qap5aO4i9A" },
  { title: "Deep Focus Signal", youtubeId: "DWcJFNfaw9c" },
  { title: "Naval Engine Room Ambience", youtubeId: "XULUBg_ZcAU" },
];
