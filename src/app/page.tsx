"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fromLocalDateKey, toLocalDateKey, toLocalDateKeyFromTimestamp } from "@/lib/date";
import { useStudydimStore } from "@/store/studydim-store";
import type { TimerMode } from "@/types/domain";

function formatTimer(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function fromDateKey(dateKey: string): Date {
  return fromLocalDateKey(dateKey);
}

function normalizeHeatIntensity(minutes: number): number {
  if (minutes <= 0) return 0;
  const minMinutes = 60;
  const maxMinutes = 15 * 60;
  const clamped = Math.min(Math.max(minutes, minMinutes), maxMinutes);
  return (clamped - minMinutes) / (maxMinutes - minMinutes);
}

function normalizeEmbedUrl(rawUrl: string): { type: "audio" | "iframe"; src: string } | null {
  const url = rawUrl.trim();
  if (!url) return null;

  if (/\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(url)) {
    return { type: "audio", src: url };
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      const list = parsed.searchParams.get("list");
      if (id) {
        const listParam = list ? `&list=${list}` : "";
        return { type: "iframe", src: `https://www.youtube.com/embed/${id}?rel=0&controls=1${listParam}` };
      }
      if (list) return { type: "iframe", src: `https://www.youtube.com/embed/videoseries?list=${list}&rel=0&controls=1` };
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      if (id) return { type: "iframe", src: `https://www.youtube.com/embed/${id}?rel=0&controls=1` };
    }

    if (host === "open.spotify.com") {
      const [, kind, id] = parsed.pathname.split("/");
      if (kind && id) {
        return { type: "iframe", src: `https://open.spotify.com/embed/${kind}/${id}` };
      }
    }

    return { type: "iframe", src: url };
  } catch {
    return null;
  }
}

const MOTIVATIONAL_QUOTES = [
  "Voce so fracassa quando desiste de tentar.",
  "As vezes voce ganha, as vezes voce aprende.",
  "Disciplina pesa gramas. Arrependimento pesa toneladas.",
  "Consistencia vence intensidade ocasional.",
];

const NAV_ITEMS = [
  { id: "focus" as const, label: "Timer", short: "Timer" },
  { id: "tasks" as const, label: "Tarefas", short: "Tasks" },
  { id: "sound" as const, label: "Som", short: "Som" },
  { id: "journal" as const, label: "Diario", short: "Diario" },
  { id: "settings" as const, label: "Configuracoes", short: "Config" },
];

const TIMER_MODES: { id: TimerMode; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "shortBreak", label: "Short Break" },
  { id: "longBreak", label: "Long Break" },
];

const glassPill: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  backdropFilter: "blur(24px) saturate(160%)",
  WebkitBackdropFilter: "blur(24px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
};

const glassActive: React.CSSProperties = {
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.2)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
};

const glassGhost: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

function Heatmap2D({ studyLogs, todayKey }: { studyLogs: { date: string; minutes: number }[]; todayKey: string }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null);

  const CELL = 9;
  const GAP = 1;
  const STEP = CELL + GAP;
  const DAY_LABEL_W = 26;
  const MONTH_LABEL_H = 16;

  const data = useMemo(() => {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const gridStart = addDays(yearStart, -yearStart.getDay());
    const gridEnd = addDays(yearEnd, 6 - yearEnd.getDay());
    const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000);
    const weeks = Math.floor(totalDays / 7) + 1;

    const logMap = new Map<string, number>();
    studyLogs.forEach((entry) => {
      const key = toLocalDateKeyFromTimestamp(entry.date);
      logMap.set(key, (logMap.get(key) ?? 0) + entry.minutes);
    });

    const cells: Array<{ date: Date; dateKey: string; x: number; y: number; inYear: boolean; minutes: number; intensity: number }> = [];

    for (let i = 0; i <= totalDays; i++) {
      const date = addDays(gridStart, i);
      const dateKey = toLocalDateKey(date);
      const weekIndex = Math.floor(i / 7);
      const dayIndex = date.getDay();
      const inYear = date.getFullYear() === year;
      const minutes = inYear ? logMap.get(dateKey) ?? 0 : 0;
      const intensity = normalizeHeatIntensity(minutes);
      cells.push({ date, dateKey, x: weekIndex * STEP, y: dayIndex * STEP, inYear, minutes, intensity });
    }

    const monthLabels = Array.from({ length: 12 }, (_, month) => {
      const monthDate = new Date(year, month, 1);
      const offsetDays = Math.floor((monthDate.getTime() - gridStart.getTime()) / 86_400_000);
      const weekIndex = Math.floor(offsetDays / 7);
      return {
        label: monthDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        x: weekIndex * STEP,
      };
    });

    return { cells, monthLabels, svgW: weeks * STEP + DAY_LABEL_W, svgH: 7 * STEP + MONTH_LABEL_H };
    // STEP, DAY_LABEL_W and MONTH_LABEL_H are static constants inside this component scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyLogs]);

  return (
    <div className="relative w-full" onMouseLeave={() => setTooltip(null)}>
      <svg viewBox={`0 0 ${data.svgW} ${data.svgH}`} className="mx-auto h-auto w-full max-w-[1120px]" preserveAspectRatio="xMidYMid meet" aria-label="Heatmap 2D">
        {data.monthLabels.map((month, idx) => (
          <text key={idx} x={month.x + DAY_LABEL_W} y={10} fontSize="7" fill="rgba(255,255,255,0.28)" fontFamily="monospace">
            {month.label}
          </text>
        ))}

        {["Dom", "", "Ter", "", "Qui", "", "Sab"].map((label, idx) =>
          label ? (
            <text key={idx} x={DAY_LABEL_W - 3} y={MONTH_LABEL_H + idx * STEP + CELL - 1} fontSize="6.5" fill="rgba(255,255,255,0.24)" fontFamily="monospace" textAnchor="end">
              {label}
            </text>
          ) : null,
        )}

        <g transform={`translate(${DAY_LABEL_W}, ${MONTH_LABEL_H})`}>
          {data.cells.map((cell) => {
            const hasStudy = cell.minutes > 0;
            const fill = !cell.inYear
              ? "rgba(255,255,255,0.015)"
              : !hasStudy
                ? "rgba(255,255,255,0.04)"
                : `rgba(${Math.round(150 + 85 * cell.intensity)},${Math.round(35 + 30 * cell.intensity)},${Math.round(35 + 30 * cell.intensity)},${0.2 + cell.intensity * 0.75})`;

            return (
              <rect
                key={cell.dateKey}
                x={cell.x}
                y={cell.y}
                width={CELL}
                height={CELL}
                rx={2}
                fill={fill}
                stroke={cell.dateKey === todayKey ? "rgba(255,255,255,0.9)" : "none"}
                strokeWidth={cell.dateKey === todayKey ? 1 : 0}
                onMouseMove={(event) => {
                  if (!cell.inYear) return;
                  const parent = event.currentTarget.ownerSVGElement;
                  if (!parent) return;
                  const bounds = parent.getBoundingClientRect();
                  setTooltip({
                    x: event.clientX - bounds.left + 12,
                    y: event.clientY - bounds.top + 14,
                    label: cell.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
                    value: cell.minutes,
                  });
                }}
              />
            );
          })}
        </g>
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg px-2 py-1"
          style={{ left: tooltip.x, top: tooltip.y, ...glassPill, fontSize: "0.7rem", color: "rgba(255,255,255,0.85)" }}
        >
          <p className="font-mono">{tooltip.label}</p>
          <p className="font-mono">{tooltip.value} min</p>
        </div>
      )}
    </div>
  );
}

function Heatmap3D({ studyLogs }: { studyLogs: { date: string; minutes: number }[] }) {
  const ROWS = 7;
  const TW = 18;
  const TH = 6;
  const MAX_H = 24;

  const data = useMemo(() => {
    const year = new Date().getFullYear();
    const periodStart = new Date(year, new Date().getMonth(), 1);
    const periodEnd = new Date(year, 11, 31);
    const gridStart = addDays(periodStart, -periodStart.getDay());
    const totalDays = Math.round((periodEnd.getTime() - gridStart.getTime()) / 86_400_000);
    const cols = Math.floor(totalDays / 7) + 1;
    const svgW = cols * (TW / 2) + (ROWS + 2) * TW;
    const svgH = (cols + ROWS + 4) * TH + MAX_H;
    const cx = ROWS * (TW / 2) + 18;
    const cy = MAX_H + TH + 10;

    const logMap = new Map<string, number>();
    studyLogs.forEach((entry) => {
      const key = toLocalDateKeyFromTimestamp(entry.date);
      logMap.set(key, (logMap.get(key) ?? 0) + entry.minutes);
    });

    const grid: Array<{ row: number; col: number; minutes: number }> = [];

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < ROWS; row++) {
        const offset = col * 7 + row;
        const date = addDays(gridStart, offset);
        if (date < periodStart || date > periodEnd) continue;
        const key = toLocalDateKey(date);
        const minutes = logMap.get(key) ?? 0;
        grid.push({ row, col, minutes });
      }
    }

    const monthLabels = Array.from({ length: 12 - periodStart.getMonth() }, (_, index) => {
      const month = periodStart.getMonth() + index;
      const monthDate = new Date(year, month, 1);
      const offsetDays = Math.max(
        0,
        Math.floor((monthDate.getTime() - gridStart.getTime()) / 86_400_000),
      );
      const col = Math.floor(offsetDays / 7);
      const anchorRow = ROWS - 1;
      const bx = cx + (col - anchorRow) * (TW / 2);
      const by = cy + (col + anchorRow) * TH;
      return {
        label: monthDate
          .toLocaleDateString("pt-BR", { month: "short" })
          .replace(".", ""),
        x: bx - TW / 2,
        y: by + TH + 10,
      };
    });

    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    const dayLabels = dayNames
      .map((label, row) => {
        if (row % 2 !== 0) return null;
        const bx = cx + (0 - row) * (TW / 2);
        const by = cy + (0 + row) * TH;
        return { label, x: bx - TW / 2 - 5, y: by + 3 };
      })
      .filter((item): item is { label: string; x: number; y: number } => item !== null);

    return {
      grid: [...grid].sort((a, b) => a.col + a.row - (b.col + b.row) || a.col - b.col),
      monthLabels,
      dayLabels,
      svgW,
      svgH,
      cx,
      cy,
    };
  }, [studyLogs]);

  const points = (list: [number, number][]): string => list.map((p) => p.join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${data.svgW} ${data.svgH}`} className="w-full max-w-[880px] h-auto mx-auto" preserveAspectRatio="xMidYMid meet" aria-label="Heatmap 3D">
      {data.grid.map((block) => {
        const intensity = normalizeHeatIntensity(block.minutes);
        const h = block.minutes > 0 ? Math.max(2, intensity * MAX_H) : 0;
        const bx = data.cx + (block.col - block.row) * (TW / 2);
        const by = data.cy + (block.col + block.row) * TH;

        const N: [number, number] = [bx, by - TH];
        const E: [number, number] = [bx + TW / 2, by];
        const S: [number, number] = [bx, by + TH];
        const W: [number, number] = [bx - TW / 2, by];
        const Nt: [number, number] = [bx, by - TH - h];
        const Et: [number, number] = [bx + TW / 2, by - h];
        const St: [number, number] = [bx, by + TH - h];
        const Wt: [number, number] = [bx - TW / 2, by - h];

        if (h < 0.5) {
          return <polygon key={`${block.col}-${block.row}`} points={points([N, E, S, W])} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" />;
        }

        const topR = Math.round(18 + 60 * intensity);
        const topG = Math.round(170 + 85 * intensity);
        const topB = Math.round(85 + 70 * intensity);
        const alpha = 0.26 + intensity * 0.64;

        return (
          <g key={`${block.col}-${block.row}`}>
            <polygon points={points([Wt, St, S, W])} fill={`rgba(${Math.round(topR * 0.6)},${Math.round(topG * 0.6)},${Math.round(topB * 0.6)},${alpha * 0.6})`} stroke="rgba(0,0,0,0.1)" strokeWidth="0.4" />
            <polygon points={points([St, Et, E, S])} fill={`rgba(${Math.round(topR * 0.75)},${Math.round(topG * 0.75)},${Math.round(topB * 0.75)},${alpha * 0.75})`} stroke="rgba(0,0,0,0.1)" strokeWidth="0.4" />
            <polygon points={points([Nt, Et, St, Wt])} fill={`rgba(${topR},${topG},${topB},${alpha})`} stroke="rgba(255,255,255,0.1)" strokeWidth="0.4" />
          </g>
        );
      })}

      {data.monthLabels.map((month) => (
        <text
          key={`month-${month.label}-${month.x}`}
          x={month.x}
          y={month.y}
          fontSize="7"
          fill="rgba(255,255,255,0.24)"
          fontFamily="monospace"
          textAnchor="start"
        >
          {month.label}
        </text>
      ))}

      {data.dayLabels.map((day) => (
        <text
          key={`day-${day.label}`}
          x={day.x}
          y={day.y}
          fontSize="7"
          fill="rgba(255,255,255,0.24)"
          fontFamily="monospace"
          textAnchor="end"
        >
          {day.label}
        </text>
      ))}
    </svg>
  );
}

function SettingsModal({
  onClose,
  focusMinutes,
  shortBreakMinutes,
  longBreakMinutes,
  motivationalPhrase,
  onSave,
  onResetHeatmaps,
}: {
  onClose: () => void;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  motivationalPhrase: string;
  onSave: (payload: { focus: number; shortBreak: number; longBreak: number; phrase: string }) => void;
  onResetHeatmaps: () => void;
}) {
  const [focus, setFocus] = useState(focusMinutes);
  const [shortBreak, setShortBreak] = useState(shortBreakMinutes);
  const [longBreak, setLongBreak] = useState(longBreakMinutes);
  const [phrase, setPhrase] = useState(motivationalPhrase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[520px] rounded-3xl p-5" style={{ ...glassPill, background: "rgba(10,10,18,0.82)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Configuracoes</h2>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-xs" style={{ ...glassGhost, color: "rgba(255,255,255,0.6)" }}>
            Fechar
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-white/70">
              Focus (min)
              <input type="number" min={1} value={focus} onChange={(e) => setFocus(Number(e.target.value))} className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none" style={glassGhost} />
            </label>
            <label className="text-xs text-white/70">
              Short (min)
              <input type="number" min={1} value={shortBreak} onChange={(e) => setShortBreak(Number(e.target.value))} className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none" style={glassGhost} />
            </label>
            <label className="text-xs text-white/70">
              Long (min)
              <input type="number" min={1} value={longBreak} onChange={(e) => setLongBreak(Number(e.target.value))} className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none" style={glassGhost} />
            </label>
          </div>

          <label className="block text-xs text-white/70">
            Frase motivacional customizada
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Digite para substituir as frases rotativas" className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none placeholder:text-white/30" style={glassGhost} />
          </label>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button onClick={onResetHeatmaps} className="h-10 w-44 rounded-full text-xs text-white/75" style={{ ...glassGhost, borderColor: "rgba(245,120,120,0.35)" }}>Resetar mapas de calor</button>
            <button onClick={onClose} className="h-10 w-28 rounded-full text-xs text-white/60" style={glassGhost}>Cancelar</button>
            <button onClick={() => onSave({ focus: Math.max(1, focus), shortBreak: Math.max(1, shortBreak), longBreak: Math.max(1, longBreak), phrase })} className="h-10 w-28 rounded-full text-xs text-white" style={glassPill}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const {
    appTab,
    timerMode,
    timerDurations,
    secondsLeft,
    timerRunning,
    focusCyclesCompleted,
    modeSwitchedAt,
    customMotivationalPhrase,
    dailyNotes,
    tasks,
    studyLogs,
    ambientTracks,
    currentTrackId,
    customSoundUrl,
    setTab,
    setTimerMode,
    updateTimerDurations,
    setCustomMotivationalPhrase,
    setDailyNote,
    toggleTimer,
    resetTimer,
    skipCycle,
    tick,
    addTask,
    toggleTask,
    removeTask,
    rolloverTasksForDate,
    setTrack,
    setCustomSoundUrl,
    resetAnalytics,
  } = useStudydimStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [show3D, setShow3D] = useState(false);

  const [taskInput, setTaskInput] = useState("");
  const [priorityInput, setPriorityInput] = useState<"high" | "medium" | "low">("medium");

  const [soundInput, setSoundInput] = useState(customSoundUrl);
  const [soundAutoplay, setSoundAutoplay] = useState(true);
  const [soundReloadSeed, setSoundReloadSeed] = useState(0);

  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteVisible, setQuoteVisible] = useState(true);

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => toLocalDateKey(new Date()));

  // Reactive today — updates exactly at midnight without page reload
  const [todayKey, setTodayKey] = useState(() => toLocalDateKey(new Date()));
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = tomorrow.getTime() - now.getTime();
    const id = window.setTimeout(() => setTodayKey(toLocalDateKey(new Date())), ms);
    return () => window.clearTimeout(id);
  }, [todayKey]);

  useEffect(() => {
    rolloverTasksForDate(todayKey);
  }, [todayKey, rolloverTasksForDate]);

  const previousSwitchRef = useRef(modeSwitchedAt);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, tick]);

  useEffect(() => {
    if (!modeSwitchedAt || modeSwitchedAt === previousSwitchRef.current) return;
    previousSwitchRef.current = modeSwitchedAt;
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = timerMode === "focus" ? 660 : 440;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close().catch(() => undefined), 400);
  }, [modeSwitchedAt, timerMode]);

  useEffect(() => {
    if (customMotivationalPhrase.trim()) return;
    const interval = window.setInterval(() => {
      setQuoteVisible(false);
      window.setTimeout(() => {
        setQuoteIndex((value) => (value + 1) % MOTIVATIONAL_QUOTES.length);
        setQuoteVisible(true);
      }, 350);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [customMotivationalPhrase]);

  const dateLabel = useMemo(
    () => fromDateKey(todayKey).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""),
    [todayKey],
  );

  const displayedQuote = customMotivationalPhrase.trim() ? customMotivationalPhrase : MOTIVATIONAL_QUOTES[quoteIndex];

  const focusStudyLogs = useMemo(() => studyLogs.filter((entry) => entry.mode === "focus"), [studyLogs]);

  const dailyMinutesMap = useMemo(() => {
    const map = new Map<string, number>();
    focusStudyLogs.forEach((entry) => {
      const key = toLocalDateKeyFromTimestamp(entry.date);
      map.set(key, (map.get(key) ?? 0) + entry.minutes);
    });
    return map;
  }, [focusStudyLogs]);

  const totalMinutes = useMemo(() => focusStudyLogs.reduce((sum, item) => sum + item.minutes, 0), [focusStudyLogs]);

  const selectedDayMinutes = dailyMinutesMap.get(selectedDateKey) ?? 0;
  const selectedNote = dailyNotes[selectedDateKey] ?? "";

  const monthDays = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    return Array.from({ length: 42 }, (_, idx) => addDays(gridStart, idx));
  }, [calendarMonth]);

  const resolvedCustomSound = useMemo(() => normalizeEmbedUrl(customSoundUrl), [customSoundUrl]);

  const fallbackSoundSrc = useMemo(
    () => `https://www.youtube.com/embed/${currentTrackId}?autoplay=${soundAutoplay ? 1 : 0}&controls=1&rel=0`,
    [currentTrackId, soundAutoplay],
  );

  const customSoundSrc = useMemo(() => {
    if (!resolvedCustomSound || resolvedCustomSound.type !== "iframe") return "";
    const separator = resolvedCustomSound.src.includes("?") ? "&" : "?";
    return `${resolvedCustomSound.src}${separator}autoplay=${soundAutoplay ? 1 : 0}`;
  }, [resolvedCustomSound, soundAutoplay]);

  const timerButtonClass = "w-full rounded-full px-3 py-2 sm:px-4 sm:py-1.5 text-xs uppercase tracking-[0.08em] font-mono transition-all duration-200";

  return (
    <main className="relative w-full flex flex-col p-4 md:p-6 pb-28 sm:pb-36" style={{ background: "#08080f", minHeight: "100dvh", overflowY: "auto", overflowX: "hidden" }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(82,88,170,0.07) 0%, transparent 65%)" }} />


      <div className="relative z-10 flex flex-col flex-1">
        <header className="w-full flex justify-between items-start absolute top-0 left-0 p-4 sm:p-5 z-10">
          <div>
            <p className="label header-label" style={{ color: "rgba(255,255,255,0.45)" }}>Studydim</p>
            <p className="label header-date mt-0.5" style={{ color: "rgba(255,255,255,0.22)" }}>{dateLabel}</p>
          </div>
          <div className="text-right" style={{ opacity: quoteVisible ? 1 : 0.2, transition: "opacity 350ms ease" }}>
            <p className="label header-quote normal-case tracking-normal" style={{ color: "rgba(255,255,255,0.36)" }}>{displayedQuote}</p>
          </div>
        </header>

        <section className="flex-1 flex flex-col items-center justify-center gap-6 md:gap-8 pt-24 sm:pt-14 pb-2">
          <div className="grid grid-cols-3 gap-1.5 w-full max-w-[420px]">
            {TIMER_MODES.map((modeItem) => {
              const isActive = timerMode === modeItem.id;
              return (
                <button key={modeItem.id} onClick={() => setTimerMode(modeItem.id)} className={timerButtonClass} style={{ ...(isActive ? { ...glassPill, ...glassActive } : glassPill), color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.58)" }}>
                  {modeItem.label}
                </button>
              );
            })}
          </div>

          <div className="w-full text-center select-none">
            <p className="font-mono font-black leading-none tracking-tight text-white text-[10vh] sm:text-[12vh] md:text-[13vh]" style={{ letterSpacing: "-0.04em", textShadow: "0 0 80px rgba(255,255,255,0.08)" }}>
              {formatTimer(secondsLeft)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 w-full max-w-[420px]">
            <button onClick={toggleTimer} className={timerButtonClass} style={{ ...glassPill, color: "rgba(255,255,255,0.92)" }}>{timerRunning ? "Pausar" : "Iniciar"}</button>
            <button onClick={resetTimer} className={timerButtonClass} style={{ ...glassPill, color: "rgba(255,255,255,0.92)" }}>Reset</button>
            <button onClick={skipCycle} className={timerButtonClass} style={{ ...glassPill, color: "rgba(255,255,255,0.92)" }}>Proximo</button>
          </div>

          <div className="text-center">
            <p className="label" style={{ color: "rgba(255,255,255,0.3)" }}>Ciclos</p>
            <p className="font-mono text-2xl font-bold" style={{ color: "rgba(255,255,255,0.76)" }}>{focusCyclesCompleted}</p>
          </div>
        </section>

        <section className="mt-2 w-full pb-24">
          <div className="w-full max-w-6xl mx-auto flex flex-col items-center">
            <div className="w-full flex justify-between items-end mb-4">
              <div>
                <p className="font-semibold" style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Minutos de estudo</p>
                <p className="label mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>janeiro a dezembro</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold" style={{ fontSize: "1.6rem", color: "rgba(255,255,255,0.65)" }}>{totalMinutes}</p>
                <p className="label" style={{ color: "rgba(255,255,255,0.22)" }}>total (min)</p>
              </div>
            </div>

            <Heatmap2D studyLogs={focusStudyLogs} todayKey={todayKey} />

            <div className="mt-5 flex items-center justify-center">
              <button onClick={() => setShow3D((value) => !value)} className="label rounded-full px-5 py-2" style={{ ...glassGhost, color: "rgba(255,255,255,0.48)" }}>
                {show3D ? "Ocultar detalhes" : "Ver detalhes"}
              </button>
            </div>

            {show3D && (
              <div className="mt-4 w-full">
                <Heatmap3D studyLogs={focusStudyLogs} />
              </div>
            )}
          </div>

          {appTab === "tasks" && (
            <div className="mt-8 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "2rem" }}>
              <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Tarefas</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_90px]">
                <input value={taskInput} onChange={(e) => setTaskInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addTask(taskInput, priorityInput); setTaskInput(""); } }} placeholder="Nova tarefa..." className="rounded-2xl px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/20" style={glassGhost} />
                <select
                  value={priorityInput}
                  onChange={(e) => setPriorityInput(e.target.value as "high" | "medium" | "low")}
                  className="rounded-2xl px-3 py-2.5 text-sm outline-none cursor-pointer"
                  style={{ ...glassGhost, background: "rgba(14,16,26,0.92)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.14)" }}
                >
                  <option value="high" style={{ background: "#0e101a", color: "#f4f6ff" }}>Alta</option>
                  <option value="medium" style={{ background: "#0e101a", color: "#f4f6ff" }}>Media</option>
                  <option value="low" style={{ background: "#0e101a", color: "#f4f6ff" }}>Baixa</option>
                </select>
                <button onClick={() => { addTask(taskInput, priorityInput); setTaskInput(""); }} className="label rounded-2xl px-3 py-2.5 text-white" style={glassPill}>Inserir</button>
              </div>

              <div className="scroll-slim max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-200"
                    style={{
                      background: task.completed ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                      border: task.completed ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTask(task.id)}
                        className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200"
                        style={{
                          width: 20,
                          height: 20,
                          background: task.completed ? "rgba(255,255,255,0.88)" : "transparent",
                          border: task.completed ? "none" : "1.5px solid rgba(255,255,255,0.3)",
                        }}
                        aria-label={task.completed ? "Desmarcar" : "Marcar como concluida"}
                      >
                        {task.completed && (
                          <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                            <path d="M1 3.5L4 6.5L10 1" stroke="#08080f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <span
                        className="text-sm transition-all duration-200"
                        style={{
                          color: task.completed ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.78)",
                          textDecorationLine: task.completed ? "line-through" : "none",
                          textDecorationColor: "rgba(255,255,255,0.2)",
                        }}
                      >
                        {task.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="label" style={{ opacity: task.completed ? 0.35 : 0.7 }}>{task.priority}</span>
                      <button
                        onClick={() => removeTask(task.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity duration-150 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        style={{ ...glassGhost, color: "rgba(255,255,255,0.72)" }}
                        aria-label="Excluir tarefa"
                        title="Excluir tarefa"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 7H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                          <path d="M9 7V5.6C9 4.72 9.72 4 10.6 4H13.4C14.28 4 15 4.72 15 5.6V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                          <path d="M7.5 7L8.2 18.1C8.28 19.35 9.31 20.33 10.56 20.33H13.44C14.69 20.33 15.72 19.35 15.8 18.1L16.5 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                          <path d="M10 11V16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                          <path d="M14 11V16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {appTab === "sound" && (
            <div className="mt-8 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "2rem" }}>
              <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Modulo de Som</h3>

              <div className="grid gap-2 sm:grid-cols-3">
                {ambientTracks.map((track) => (
                  <button key={track.youtubeId} onClick={() => setTrack(track.youtubeId)} className="rounded-2xl px-3 py-2.5 text-left text-sm" style={{ ...(currentTrackId === track.youtubeId ? glassActive : glassGhost), color: currentTrackId === track.youtubeId ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)" }}>
                    {track.title}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
                <input value={soundInput} onChange={(e) => setSoundInput(e.target.value)} placeholder="Cole URL (YouTube, Spotify embed, radio, mp3...)" className="rounded-2xl px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25" style={glassGhost} />
                <button onClick={() => setCustomSoundUrl(soundInput)} className="label rounded-2xl px-3 py-2.5 text-white" style={glassPill}>Aplicar URL</button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setSoundAutoplay((value) => !value)} className="label rounded-full px-4 py-2" style={{ ...glassGhost, color: "rgba(255,255,255,0.52)" }}>{soundAutoplay ? "Autoplay ON" : "Autoplay OFF"}</button>
                <button onClick={() => setSoundReloadSeed((value) => value + 1)} className="label rounded-full px-4 py-2" style={{ ...glassGhost, color: "rgba(255,255,255,0.52)" }}>Recarregar</button>
              </div>

            </div>
          )}

          {appTab === "journal" && (
            <div className="mt-8 space-y-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "2rem" }}>
              <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Calendario e notas</h3>

              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div className="rounded-2xl p-3 space-y-3" style={glassGhost}>
                  <div className="flex items-center justify-between mb-1">
                    <button
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                      className="h-7 w-7 flex items-center justify-center rounded-full text-sm"
                      style={{ ...glassGhost, color: "rgba(255,255,255,0.55)" }}
                    >‹</button>
                    <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
                      {calendarMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </p>
                    <button
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                      className="h-7 w-7 flex items-center justify-center rounded-full text-sm"
                      style={{ ...glassGhost, color: "rgba(255,255,255,0.55)" }}
                    >›</button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((label, idx) => (
                      <p key={idx} className="label" style={{ color: "rgba(255,255,255,0.22)" }}>{label}</p>
                    ))}

                    {monthDays.map((day) => {
                      const key = toLocalDateKey(day);
                      const inMonth = day.getMonth() === calendarMonth.getMonth();
                      const selected = key === selectedDateKey;
                      const isToday = key === todayKey;

                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedDateKey(key)}
                          className="h-8 rounded-lg text-xs transition-all duration-150"
                          style={{
                            ...(selected ? { ...glassPill, ...glassActive } : glassGhost),
                            color: inMonth ? (selected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.62)") : "rgba(255,255,255,0.24)",
                            ...(isToday && !selected ? { boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.75)" } : {}),
                            ...(isToday && selected ? { boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.9), 0 0 0 1.5px rgba(255,255,255,0.4)" } : {}),
                          }}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl p-3 space-y-2" style={glassGhost}>
                  <p className="font-mono text-sm text-white/75">{fromDateKey(selectedDateKey).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                  <p className="label" style={{ color: "rgba(255,255,255,0.28)" }}>Estudo no dia: {selectedDayMinutes} min</p>
                  <textarea rows={12} value={selectedNote} onChange={(e) => setDailyNote(selectedDateKey, e.target.value)} placeholder="Escreva observacoes do dia" className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none resize-none placeholder:text-white/25" style={glassGhost} />
                </div>
              </div>
            </div>
          )}
          {/* Always-mounted player — key only changes on URL/reload, never on tab switch */}
          <div
            className={appTab === "sound" ? "rounded-2xl overflow-hidden" : ""}
            style={
              appTab === "sound"
                ? { marginTop: "1rem" }
                : { position: "fixed", left: -9999, top: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" }
            }
          >
            {resolvedCustomSound?.type === "audio" ? (
              <audio
                key={`p-${resolvedCustomSound.src}-${soundReloadSeed}`}
                src={resolvedCustomSound.src}
                controls={appTab === "sound"}
                autoPlay={soundAutoplay}
                className="w-full"
                style={{ colorScheme: "dark", display: "block" }}
              />
            ) : (
              <iframe
                key={`p-${customSoundSrc || fallbackSoundSrc}-${soundReloadSeed}`}
                src={customSoundSrc || fallbackSoundSrc}
                title="Player"
                allow="autoplay; encrypted-media"
                allowFullScreen
                style={{
                  display: "block",
                  width: "100%",
                  aspectRatio: appTab === "sound" ? "16/9" : undefined,
                  height: appTab === "sound" ? undefined : 1,
                }}
              />
            )}
          </div>
        </section>
      </div>

      <nav className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[calc(100vw-1rem)]">
        <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2" style={{ borderRadius: "999px", ...glassPill }}>
          {NAV_ITEMS.map((item) => {
            const active = item.id === "settings" ? settingsOpen : appTab === (item.id as typeof appTab);
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === "settings") {
                    setSettingsOpen(true);
                    return;
                  }
                  setTab(item.id as "focus" | "tasks" | "sound" | "journal" | "settings");
                }}
                className="label px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full whitespace-nowrap"
                style={{ ...(active ? { ...glassPill, ...glassActive } : {}), color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)" }}
              >
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {settingsOpen && (
        <SettingsModal
          key={`${timerDurations.focus}-${timerDurations.shortBreak}-${timerDurations.longBreak}-${customMotivationalPhrase}`}
          onClose={() => setSettingsOpen(false)}
          focusMinutes={Math.round(timerDurations.focus / 60)}
          shortBreakMinutes={Math.round(timerDurations.shortBreak / 60)}
          longBreakMinutes={Math.round(timerDurations.longBreak / 60)}
          motivationalPhrase={customMotivationalPhrase}
          onResetHeatmaps={() => {
            resetAnalytics();
          }}
          onSave={(payload) => {
            updateTimerDurations({ focus: payload.focus, shortBreak: payload.shortBreak, longBreak: payload.longBreak });
            setCustomMotivationalPhrase(payload.phrase);
            setSettingsOpen(false);
          }}
        />
      )}
    </main>
  );
}
