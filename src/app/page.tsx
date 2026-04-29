"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fromLocalDateKey, toLocalDateKey, toLocalDateKeyFromTimestamp } from "@/lib/date";
import { useStudydimStore } from "@/store/studydim-store";
import type { TimerMode, TopicColor } from "@/types/domain";

function formatTimer(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatChronometer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safeSeconds % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatMinutesAsHours(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (safeMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}h`;
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
        return {
          type: "iframe",
          src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&controls=1&modestbranding=1&playsinline=1${listParam}`,
        };
      }
      if (list) {
        return {
          type: "iframe",
          src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&rel=0&controls=1&modestbranding=1&playsinline=1`,
        };
      }
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      if (id) {
        return {
          type: "iframe",
          src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&controls=1&modestbranding=1&playsinline=1`,
        };
      }
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

function splitMotivationalQuote(raw: string): { text: string; author?: string } {
  const value = raw.trim();
  if (!value) return { text: "" };

  const separators = [" — ", " - "];
  for (const separator of separators) {
    const index = value.lastIndexOf(separator);
    if (index > 0 && index < value.length - separator.length) {
      const text = value.slice(0, index).trim();
      const author = value.slice(index + separator.length).trim();
      if (text && author) {
        return { text, author };
      }
    }
  }

  return { text: value };
}

const MOTIVATIONAL_QUOTES = [
  "Voce so fracassa quando desiste de tentar.",
  "As vezes voce ganha, as vezes voce aprende.",
  "Disciplina pesa gramas. Arrependimento pesa toneladas.",
  "Consistencia vence intensidade ocasional.",
  "Nós somos o que fazemos repetidamente. A excelência, portanto, não é um ato, mas um hábito. — Aristóteles",
  "A disciplina é a alma de um exército. Ela torna pequenos contingentes formidáveis; fornece sucesso aos fracos e estima a todos. — George Washington",
  "Se você quer mudar o mundo, comece arrumando a sua cama. — Almirante William H. McRaven",
  "O sucesso não é final, o fracasso não é fatal: é a coragem de continuar que conta. — Winston Churchill",
  "Eu não falhei. Apenas descobri 10.000 caminhos que não funcionam. — Thomas Edison",
  "Não importa o quão devagar você vá, desde que você não pare. — Confúcio",
  "A coragem é a resistência ao medo, o domínio do medo, e não a ausência do medo. — Mark Twain",
  "A sorte é o que acontece quando a preparação encontra a oportunidade. — Sêneca",
  "A diferença entre uma pessoa de sucesso e as outras não é a falta de força, nem a falta de conhecimento, mas sim a falta de vontade. — Vince Lombardi",
  "Quem tem um 'porquê' pelo qual viver suporta quase qualquer 'como'. — Viktor Frankl",
  "A força não provém da capacidade física. Provém de uma vontade indomável. — Mahatma Gandhi",
  "O homem que move uma montanha começa carregando pequenas pedras. — Provérbio Chinês",
  "Obstáculos são aquelas coisas assustadoras que você vê quando tira os olhos do seu objetivo. — Henry Ford",
  "Para ter o que nunca teve, você precisa fazer o que nunca fez. — Thomas Jefferson",
  "A dor é temporária. Ela pode durar um minuto, ou uma hora, ou um dia, ou um ano... mas se eu desistir, ela durará para sempre. — Lance Armstrong"
];

const NAV_ITEMS = [
  { id: "focus" as const, label: "Timer", short: "Timer" },
  { id: "tasks" as const, label: "Tasks", short: "Tasks" },
  { id: "sound" as const, label: "Sound", short: "Sound" },
  { id: "journal" as const, label: "Journal", short: "Journal" },
  { id: "review" as const, label: "Review", short: "Review" },
  { id: "settings" as const, label: "Settings", short: "Config" },
];

const TIMER_MODES: { id: TimerMode; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "shortBreak", label: "Short Break" },
  { id: "longBreak", label: "Long Break" },
];

const TOPIC_COLOR_OPTIONS: Array<{ id: TopicColor; label: string; value: string }> = [
  { id: "blue", label: "Blue", value: "#3B82F6" },
  { id: "green", label: "Green", value: "#22C55E" },
  { id: "red", label: "Red", value: "#EF4444" },
  { id: "orange", label: "Orange", value: "#F97316" },
  { id: "yellow", label: "Yellow", value: "#EAB308" },
];

const DEFAULT_TOPIC_COLOR: TopicColor = "gray";

const topicColorToHex = (color: TopicColor): string =>
  (color === "gray" ? "#6B7280" : TOPIC_COLOR_OPTIONS.find((item) => item.id === color)?.value) ?? "#6B7280";

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
          <p className="font-mono">{formatMinutesAsHours(tooltip.value)}</p>
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
  reviewChecklist,
  beepVolume,
  timerBeepEnabled,
  reviewBeepEnabled,
  timerSystemMode,
  motivationalPhrase,
  onSave,
  onResetHeatmaps,
}: {
  onClose: () => void;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  reviewChecklist: { weekly: number; biweekly: number; monthly: number };
  beepVolume: number;
  timerBeepEnabled: boolean;
  reviewBeepEnabled: boolean;
  timerSystemMode: "pomodoro" | "chronometer";
  motivationalPhrase: string;
  onSave: (payload: {
    focus: number;
    shortBreak: number;
    longBreak: number;
    phrase: string;
    mode: "pomodoro" | "chronometer";
    reviewChecklist: { weekly: number; biweekly: number; monthly: number };
    beepVolume: number;
    timerBeepEnabled: boolean;
    reviewBeepEnabled: boolean;
  }) => void;
  onResetHeatmaps: () => void;
}) {
  const [focus, setFocus] = useState(focusMinutes);
  const [shortBreak, setShortBreak] = useState(shortBreakMinutes);
  const [longBreak, setLongBreak] = useState(longBreakMinutes);
  const [phrase, setPhrase] = useState(motivationalPhrase);
  const [mode, setMode] = useState<"pomodoro" | "chronometer">(timerSystemMode);
  const [weeklyChecks, setWeeklyChecks] = useState(reviewChecklist.weekly);
  const [biweeklyChecks, setBiweeklyChecks] = useState(reviewChecklist.biweekly);
  const [monthlyChecks, setMonthlyChecks] = useState(reviewChecklist.monthly);
  const [beepVolumePercent, setBeepVolumePercent] = useState(Math.round(beepVolume * 100));
  const [timerBeepsOn, setTimerBeepsOn] = useState(timerBeepEnabled);
  const [reviewBeepsOn, setReviewBeepsOn] = useState(reviewBeepEnabled);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[520px] rounded-3xl p-5" style={{ ...glassPill, background: "rgba(10,10,18,0.82)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-xs" style={{ ...glassGhost, color: "rgba(255,255,255,0.6)" }}>
            Close
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs text-white/70">Timer mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("pomodoro")}
                className="rounded-xl px-3 py-2 text-xs"
                style={mode === "pomodoro" ? { ...glassPill, ...glassActive, color: "rgba(255,255,255,0.9)" } : { ...glassGhost, color: "rgba(255,255,255,0.62)" }}
              >
                Pomodoro
              </button>
              <button
                type="button"
                onClick={() => setMode("chronometer")}
                className="rounded-xl px-3 py-2 text-xs"
                style={mode === "chronometer" ? { ...glassPill, ...glassActive, color: "rgba(255,255,255,0.9)" } : { ...glassGhost, color: "rgba(255,255,255,0.62)" }}
              >
                Chronometer
              </button>
            </div>
          </div>

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
            Beep volume ({beepVolumePercent}%)
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={beepVolumePercent}
              onChange={(e) => setBeepVolumePercent(Number(e.target.value))}
              className="mt-2 w-full accent-white"
            />
          </label>

          <div className="flex items-center justify-between rounded-xl px-3 py-2" style={glassGhost}>
            <p className="text-xs text-white/75">Timer beep</p>
            <button
              type="button"
              onClick={() => setTimerBeepsOn((prev) => !prev)}
              className="label rounded-full px-3 py-1 text-[10px]"
              style={timerBeepsOn ? { ...glassPill, ...glassActive, color: "rgba(255,255,255,0.9)" } : { ...glassGhost, color: "rgba(255,255,255,0.58)" }}
            >
              {timerBeepsOn ? "ON" : "OFF"}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl px-3 py-2" style={glassGhost}>
            <p className="text-xs text-white/75">Review beep</p>
            <button
              type="button"
              onClick={() => setReviewBeepsOn((prev) => !prev)}
              className="label rounded-full px-3 py-1 text-[10px]"
              style={reviewBeepsOn ? { ...glassPill, ...glassActive, color: "rgba(255,255,255,0.9)" } : { ...glassGhost, color: "rgba(255,255,255,0.58)" }}
            >
              {reviewBeepsOn ? "ON" : "OFF"}
            </button>
          </div>

          <label className="block text-xs text-white/70">
            Custom motivational phrase
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Type to replace the rotating quotes" className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none placeholder:text-white/30" style={glassGhost} />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-white/70">
              Weekly checks
              <input type="number" min={1} max={12} value={weeklyChecks} onChange={(e) => setWeeklyChecks(Number(e.target.value))} className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none" style={glassGhost} />
            </label>
            <label className="text-xs text-white/70">
              Biweekly checks
              <input type="number" min={1} max={12} value={biweeklyChecks} onChange={(e) => setBiweeklyChecks(Number(e.target.value))} className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none" style={glassGhost} />
            </label>
            <label className="text-xs text-white/70">
              Monthly checks
              <input type="number" min={1} max={12} value={monthlyChecks} onChange={(e) => setMonthlyChecks(Number(e.target.value))} className="mt-1 w-full rounded-xl px-3 py-2 text-white outline-none" style={glassGhost} />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button onClick={onResetHeatmaps} className="h-10 w-44 rounded-full text-xs text-white/75" style={{ ...glassGhost, borderColor: "rgba(245,120,120,0.35)" }}>Reset heatmaps</button>
            <button onClick={onClose} className="h-10 w-28 rounded-full text-xs text-white/60" style={glassGhost}>Cancel</button>
            <button
              onClick={() =>
                onSave({
                  focus: Math.max(1, focus),
                  shortBreak: Math.max(1, shortBreak),
                  longBreak: Math.max(1, longBreak),
                  phrase,
                  mode,
                  reviewChecklist: {
                    weekly: Math.max(1, Math.min(12, Math.round(weeklyChecks))),
                    biweekly: Math.max(1, Math.min(12, Math.round(biweeklyChecks))),
                    monthly: Math.max(1, Math.min(12, Math.round(monthlyChecks))),
                  },
                  beepVolume: Math.max(0, Math.min(100, Math.round(beepVolumePercent))) / 100,
                  timerBeepEnabled: timerBeepsOn,
                  reviewBeepEnabled: reviewBeepsOn,
                })
              }
              className="h-10 w-28 rounded-full text-xs text-white"
              style={glassPill}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const AmbientPlayer = memo(function AmbientPlayer({
  appTab,
  resolvedCustomSound,
  customSoundSrc,
  fallbackSoundSrc,
  soundAutoplay,
  soundReloadSeed,
  onClose,
}: {
  appTab: "focus" | "tasks" | "sound" | "journal" | "review" | "settings";
  resolvedCustomSound: { type: "audio" | "iframe"; src: string } | null;
  customSoundSrc: string;
  fallbackSoundSrc: string;
  soundAutoplay: boolean;
  soundReloadSeed: number;
  onClose: () => void;
}) {
  const docked = appTab !== "sound";
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<{ offsetX: number; offsetY: number; active: boolean; pointerId: number | null }>({
    offsetX: 0,
    offsetY: 0,
    active: false,
    pointerId: null,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dockedPosition, setDockedPosition] = useState<{ x: number; y: number }>({ x: 12, y: 72 });

  const getDocumentZoom = useCallback(() => {
    const rawZoom = Number.parseFloat(window.getComputedStyle(document.body).zoom || "1");
    return Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1;
  }, []);

  useEffect(() => {
    if (!docked) return;

    const width = playerRef.current?.offsetWidth ?? 240;
    const zoom = getDocumentZoom();
    setDockedPosition((prev) => {
      if (prev.x !== 12 || prev.y !== 72) return prev;
      return { x: Math.max(12, window.innerWidth / zoom - width - 12), y: 72 };
    });
  }, [docked, getDocumentZoom]);

  useEffect(() => {
    if (!isDragging) return;

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isDragging]);

  useEffect(
    () => () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
      }
    },
    [],
  );

  const endDrag = useCallback(() => {
    dragStateRef.current.active = false;
    dragStateRef.current.pointerId = null;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragStateRef.current.active || !playerRef.current) return;
      if (dragStateRef.current.pointerId !== null && moveEvent.pointerId !== dragStateRef.current.pointerId) return;

      const zoom = getDocumentZoom();
      const viewportW = document.documentElement.clientWidth / zoom;
      const viewportH = document.documentElement.clientHeight / zoom;
      const width = playerRef.current.offsetWidth;
      const height = playerRef.current.offsetHeight;
      const maxX = Math.max(0, viewportW - width);
      const maxY = Math.max(0, viewportH - height);

      const nextX = Math.max(0, Math.min(maxX, (moveEvent.clientX - dragStateRef.current.offsetX) / zoom));
      const nextY = Math.max(0, Math.min(maxY, (moveEvent.clientY - dragStateRef.current.offsetY) / zoom));
      pendingPositionRef.current = { x: nextX, y: nextY };

      if (dragRafRef.current !== null) return;

      dragRafRef.current = window.requestAnimationFrame(() => {
        if (pendingPositionRef.current) {
          setDockedPosition(pendingPositionRef.current);
        }
        pendingPositionRef.current = null;
        dragRafRef.current = null;
      });
    };

    const onPointerUp = () => {
      endDrag();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [endDrag, getDocumentZoom]);

  const onPointerDownDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!docked || !playerRef.current) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = playerRef.current.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
    };
    setIsDragging(true);
  }, [docked]);

  const onPointerUpDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endDrag();
  }, [endDrag]);

  return (
    <div
      ref={playerRef}
      className="rounded-2xl overflow-hidden"
      style={
        docked
          ? {
              position: "fixed",
              left: dockedPosition.x,
              top: dockedPosition.y,
              width: "min(240px, calc(100vw - 24px))",
              zIndex: 35,
              background: "rgba(10,10,18,0.75)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
            }
          : { marginTop: "1rem" }
      }
    >
      {docked && (
        <div
          className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5"
          style={{
            borderBottomColor: "rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <button
            ref={dragHandleRef}
            type="button"
            onPointerDown={onPointerDownDrag}
            onPointerUp={onPointerUpDrag}
            onPointerCancel={onPointerUpDrag}
            onLostPointerCapture={endDrag}
            className="flex-1 text-left font-mono text-[0.65rem] tracking-[0.08em] uppercase"
            style={{
              color: "rgba(255,255,255,0.62)",
              cursor: isDragging ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            mover player
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-0.5 text-[0.62rem] font-mono uppercase"
            style={{ ...glassGhost, color: "rgba(255,255,255,0.64)" }}
          >
            fechar
          </button>
        </div>
      )}
      {resolvedCustomSound?.type === "audio" ? (
        <audio
          key={`p-${resolvedCustomSound.src}-${soundReloadSeed}`}
          src={resolvedCustomSound.src}
          controls
          autoPlay={soundAutoplay}
          className="w-full"
          style={{ colorScheme: "dark", display: "block" }}
        />
      ) : (
        <iframe
          key={`p-${customSoundSrc || fallbackSoundSrc}-${soundReloadSeed}`}
          src={customSoundSrc || fallbackSoundSrc}
          title="Player"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16/9",
            height: "auto",
          }}
        />
      )}
    </div>
  );
});

export default function Home() {
  const {
    appTab,
    timerSystemMode,
    timerMode,
    timerDurations,
    secondsLeft,
    timerRunning,
    focusCyclesCompleted,
    modeSwitchedAt,
    beepVolume,
    timerBeepEnabled,
    reviewBeepEnabled,
    customMotivationalPhrase,
    dailyNotes,
    tasks,
    studyLogs,
    ambientTracks,
    currentTrackId,
    customSoundUrl,
    setTab,
    setTimerSystemMode,
    setTimerMode,
    updateTimerDurations,
    setBeepVolume,
    setTimerBeepEnabled,
    setReviewBeepEnabled,
    setCustomMotivationalPhrase,
    setDailyNote,
    toggleTimer,
    resetTimer,
    skipCycle,
    advanceTimerBy,
    addTask,
    toggleTask,
    removeTask,
    rolloverTasksForDate,
    setTrack,
    setCustomSoundUrl,
    resetAnalytics,
    logFocusMinutes,
    reviewBlocks,
    reviewCheckConfig,
    addReviewBlock,
    removeReviewBlock,
    updateReviewBlockName,
    setReviewCheckConfig,
    addTopicToBlock,
    updateTopicInBlock,
    removeTopicFromBlock,
    toggleTopicCheck,
    moveTopicInBlock,
    moveTopicAcrossBlocks,
  } = useStudydimStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [show3D, setShow3D] = useState(false);

  const [taskInput, setTaskInput] = useState("");
  const [priorityInput, setPriorityInput] = useState<"high" | "medium" | "low">("medium");

  const [soundInput, setSoundInput] = useState(customSoundUrl);
  const [soundAutoplay, setSoundAutoplay] = useState(true);
  const [soundReloadSeed, setSoundReloadSeed] = useState(0);
  const [chronoElapsedSeconds, setChronoElapsedSeconds] = useState(0);
  const [chronoRunning, setChronoRunning] = useState(false);
  const [chronoBreakRemaining, setChronoBreakRemaining] = useState(0);

  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteVisible, setQuoteVisible] = useState(true);

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => toLocalDateKey(new Date()));

  // Review tab states
  const [reviewBlockInputs, setReviewBlockInputs] = useState<Record<string, { topic: string }>>({});
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [dragTopic, setDragTopic] = useState<{ blockId: string; frontId: string } | null>(null);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const [reviewSearch, setReviewSearch] = useState("");
  const [focusedReviewItem, setFocusedReviewItem] = useState<string | null>(null);
  const [topicEditor, setTopicEditor] = useState<{
    blockId: string;
    frontId: string;
    title: string;
    detail: string;
    color: TopicColor;
    x: number;
    y: number;
  } | null>(null);
  const topicRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const blockCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  useEffect(() => {
    const onWindowClick = () => setTopicEditor(null);
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  const applyTopicEditorChanges = useCallback((blockId: string, frontId: string, patch: { title?: string; detail?: string; color?: TopicColor }) => {
    if (typeof updateTopicInBlock === "function") {
      updateTopicInBlock(blockId, frontId, patch);
      return;
    }

    useStudydimStore.setState((state) => ({
      reviewBlocks: state.reviewBlocks.map((block) => {
        if (block.id !== blockId) return block;
        const subject = block.subjects[0];
        if (!subject) return block;

        const normalizedTitle = typeof patch.title === "string" ? patch.title.trim() : undefined;
        const normalizedDetail = typeof patch.detail === "string" ? patch.detail.trim() : undefined;
        return {
          ...block,
          subjects: [
            {
              ...subject,
              fronts: subject.fronts.map((front) =>
                front.id !== frontId
                  ? front
                  : {
                      ...front,
                      title: normalizedTitle || front.title,
                      detail: patch.detail === undefined ? front.detail : normalizedDetail,
                      color: patch.color ?? front.color,
                    },
              ),
            },
          ],
        };
      }),
    }));
  }, [updateTopicInBlock]);

  const sortedReviewBlocks = useMemo(
    () => reviewBlocks.slice().sort((a, b) => a.order - b.order),
    [reviewBlocks],
  );

  const reviewQuery = reviewSearch.trim().toLowerCase();

  const reviewSearchMatches = useMemo(() => {
    if (!reviewQuery) {
      return {
        blockMatches: new Set<string>(),
        topicMatches: new Set<string>(),
        firstTopicMatchKey: null as string | null,
        firstBlockMatchId: null as string | null,
      };
    }

    const blockMatches = new Set<string>();
    const topicMatches = new Set<string>();
    let firstTopicMatchKey: string | null = null;
    let firstBlockMatchId: string | null = null;

    sortedReviewBlocks.forEach((block) => {
      const blockMatched = block.name.toLowerCase().includes(reviewQuery);
      if (blockMatched) {
        blockMatches.add(block.id);
        if (!firstBlockMatchId) firstBlockMatchId = block.id;
      }

      const fronts = block.subjects[0]?.fronts ?? [];
      fronts.forEach((front) => {
        if (front.title.toLowerCase().includes(reviewQuery)) {
          const key = `${block.id}::${front.id}`;
          topicMatches.add(key);
          if (!firstTopicMatchKey) firstTopicMatchKey = key;
        }
      });
    });

    return { blockMatches, topicMatches, firstTopicMatchKey, firstBlockMatchId };
  }, [reviewQuery, sortedReviewBlocks]);

  useEffect(() => {
    if (!reviewQuery) {
      setFocusedReviewItem(null);
      return;
    }

    const targetTopicKey = reviewSearchMatches.firstTopicMatchKey;
    const targetBlockId = reviewSearchMatches.firstBlockMatchId;

    if (targetTopicKey) {
      const topicBlockId = targetTopicKey.split("::")[0];
      if (collapsedBlocks[topicBlockId]) {
        setCollapsedBlocks((prev) => ({
          ...prev,
          [topicBlockId]: false,
        }));
        return;
      }

      const targetNode = topicRowRefs.current[targetTopicKey];
      if (targetNode) {
        targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
        setFocusedReviewItem(targetTopicKey);
      }
      return;
    }

    if (targetBlockId) {
      if (collapsedBlocks[targetBlockId]) {
        setCollapsedBlocks((prev) => ({
          ...prev,
          [targetBlockId]: false,
        }));
        return;
      }

      const blockNode = blockCardRefs.current[targetBlockId];
      if (blockNode) {
        blockNode.scrollIntoView({ behavior: "smooth", block: "center" });
        setFocusedReviewItem(targetBlockId);
      }
      return;
    }

    setFocusedReviewItem(null);
  }, [collapsedBlocks, reviewQuery, reviewSearchMatches.firstBlockMatchId, reviewSearchMatches.firstTopicMatchKey]);

  const previousSwitchRef = useRef(modeSwitchedAt);
  const lastTickAtRef = useRef<number | null>(null);
  const chronoLastTickAtRef = useRef<number | null>(null);
  const timerBeepEnabledRef = useRef(timerBeepEnabled);

  useEffect(() => {
    timerBeepEnabledRef.current = timerBeepEnabled;
  }, [timerBeepEnabled]);

  const playCheckBeep = useCallback(() => {
    if (!reviewBeepEnabled) return;
    const ctx = new window.AudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    const base = Math.max(0, Math.min(1, beepVolume));

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.09 * Math.max(0.25, base), now + 0.015);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    master.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.setValueAtTime(740, now);
    oscA.frequency.exponentialRampToValueAtTime(820, now + 0.09);
    oscA.connect(master);

    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.setValueAtTime(1110, now);
    oscB.connect(master);

    oscA.start(now);
    oscB.start(now + 0.01);
    oscA.stop(now + 0.22);
    oscB.stop(now + 0.16);

    window.setTimeout(() => {
      void ctx.close();
    }, 300);
  }, [beepVolume, reviewBeepEnabled]);

  const syncTimerWithElapsed = useCallback(() => {
    if (!timerRunning || timerSystemMode !== "pomodoro") return;

    const now = Date.now();
    if (lastTickAtRef.current === null) {
      lastTickAtRef.current = now;
      return;
    }

    const elapsedSeconds = Math.floor((now - lastTickAtRef.current) / 1000);
    if (elapsedSeconds <= 0) return;

    lastTickAtRef.current += elapsedSeconds * 1000;
    advanceTimerBy(elapsedSeconds);
  }, [timerRunning, advanceTimerBy, timerSystemMode]);

  useEffect(() => {
    if (!timerRunning || timerSystemMode !== "pomodoro") {
      lastTickAtRef.current = null;
      return;
    }

    lastTickAtRef.current = Date.now();
    const id = window.setInterval(syncTimerWithElapsed, 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTimerWithElapsed();
      }
    };

    window.addEventListener("focus", syncTimerWithElapsed);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", syncTimerWithElapsed);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [timerRunning, syncTimerWithElapsed, timerSystemMode]);

  const syncChronometerWithElapsed = useCallback(() => {
    if (timerSystemMode !== "chronometer") return;
    if (!chronoRunning && chronoBreakRemaining <= 0) return;

    const now = Date.now();
    if (chronoLastTickAtRef.current === null) {
      chronoLastTickAtRef.current = now;
      return;
    }

    const elapsedSeconds = Math.floor((now - chronoLastTickAtRef.current) / 1000);
    if (elapsedSeconds <= 0) return;
    chronoLastTickAtRef.current += elapsedSeconds * 1000;

    if (chronoBreakRemaining > 0) {
      setChronoBreakRemaining((value) => {
        const next = Math.max(0, value - elapsedSeconds);
        if (value > 0 && next === 0) {
          setChronoRunning(true);
        }
        return next;
      });
      return;
    }

    if (chronoRunning) {
      setChronoElapsedSeconds((value) => value + elapsedSeconds);
    }
  }, [chronoBreakRemaining, chronoRunning, timerSystemMode]);

  useEffect(() => {
    if (timerSystemMode !== "chronometer") {
      chronoLastTickAtRef.current = null;
      return;
    }

    if (!chronoRunning && chronoBreakRemaining <= 0) {
      chronoLastTickAtRef.current = null;
      return;
    }

    chronoLastTickAtRef.current = Date.now();
    const id = window.setInterval(syncChronometerWithElapsed, 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncChronometerWithElapsed();
      }
    };

    window.addEventListener("focus", syncChronometerWithElapsed);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", syncChronometerWithElapsed);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [chronoBreakRemaining, chronoRunning, syncChronometerWithElapsed, timerSystemMode]);

  useEffect(() => {
    if (!modeSwitchedAt || modeSwitchedAt === previousSwitchRef.current) return;
    previousSwitchRef.current = modeSwitchedAt;
    if (!timerBeepEnabledRef.current) return;

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
    }, 10000);
    return () => window.clearInterval(interval);
  }, [customMotivationalPhrase]);

  const dateLabel = useMemo(
    () => fromDateKey(todayKey).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""),
    [todayKey],
  );

  const displayedQuote = customMotivationalPhrase.trim() ? customMotivationalPhrase : MOTIVATIONAL_QUOTES[quoteIndex];
  const displayedQuoteParts = useMemo(() => splitMotivationalQuote(displayedQuote), [displayedQuote]);

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

  const sortedTasks = useMemo(() => {
    const priorityWeight: Record<"high" | "medium" | "low", number> = {
      high: 3,
      medium: 2,
      low: 1,
    };

    return [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tasks]);

  const monthDays = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    return Array.from({ length: 42 }, (_, idx) => addDays(gridStart, idx));
  }, [calendarMonth]);

  const resolvedCustomSound = useMemo(() => normalizeEmbedUrl(customSoundUrl), [customSoundUrl]);

  const hasQuickTrack = Boolean(currentTrackId);

  const shouldShowAmbientPlayer =
    resolvedCustomSound?.type === "audio" ||
    resolvedCustomSound?.type === "iframe" ||
    (!resolvedCustomSound && hasQuickTrack);

  const fallbackSoundSrc = useMemo(
    () => {
      if (!currentTrackId) return "";
      return `https://www.youtube-nocookie.com/embed/${currentTrackId}?autoplay=${soundAutoplay ? 1 : 0}&controls=1&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=${currentTrackId}`;
    },
    [currentTrackId, soundAutoplay],
  );

  const customSoundSrc = useMemo(() => {
    if (!resolvedCustomSound || resolvedCustomSound.type !== "iframe") return "";
    const separator = resolvedCustomSound.src.includes("?") ? "&" : "?";
    return `${resolvedCustomSound.src}${separator}autoplay=${soundAutoplay ? 1 : 0}`;
  }, [resolvedCustomSound, soundAutoplay]);

  const timerButtonClass = "w-full rounded-full px-3 py-2 sm:px-4 sm:py-1.5 text-xs uppercase tracking-[0.08em] font-mono transition-all duration-200";

  const isChronoOnBreak = timerSystemMode === "chronometer" && chronoBreakRemaining > 0;
  const chronometerDisplay = isChronoOnBreak ? formatTimer(chronoBreakRemaining) : formatChronometer(chronoElapsedSeconds);

  return (
    <main className="relative w-full flex flex-col p-4 md:p-6 pb-28 sm:pb-36" style={{ background: "#08080f", minHeight: "100dvh", overflowY: "auto", overflowX: "hidden" }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(82,88,170,0.07) 0%, transparent 65%)" }} />


      <div className="relative z-10 flex flex-col flex-1">
        {appTab !== "review" && (
          <header className="absolute inset-x-0 top-0 z-10">
            <div className="absolute left-4 top-2.5 flex flex-col items-start gap-0.5 sm:left-5 sm:top-3">
              <p className="label header-label m-0 leading-none" style={{ color: "rgba(255,255,255,0.45)" }}>Studydim</p>
              <p className="label header-date m-0 leading-none" style={{ color: "rgba(255,255,255,0.22)" }}>{dateLabel}</p>
            </div>
            <div className="absolute right-4 top-2.5 max-w-[58vw] text-right sm:right-5 sm:top-3 sm:max-w-[420px]" style={{ opacity: quoteVisible ? 1 : 0.2, transition: "opacity 350ms ease" }}>
              <p className="header-quote m-0 leading-tight" style={{ color: "rgba(255,255,255,0.42)", fontFamily: "var(--font-share-tech-mono), monospace", fontSize: "0.72rem", letterSpacing: "0.02em", textTransform: "none" }}>
                {displayedQuoteParts.text}
              </p>
              {displayedQuoteParts.author && (
                <p className="m-0 mt-0.5 leading-none" style={{ color: "rgba(255,255,255,0.32)", fontFamily: "var(--font-share-tech-mono), monospace", fontSize: "0.68rem", letterSpacing: "0.04em", textTransform: "none" }}>
                  - {displayedQuoteParts.author}
                </p>
              )}
            </div>
          </header>
        )}

        <section className="flex-1 flex flex-col items-center justify-center gap-6 md:gap-8 pt-20 sm:pt-10 pb-2" style={{ display: appTab === "review" ? "none" : undefined }}>
          {timerSystemMode === "pomodoro" ? (
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
          ) : (
            <div className="w-full max-w-[420px] text-center">
              <p className="label" style={{ color: "rgba(255,255,255,0.36)" }}>{isChronoOnBreak ? "Short Break" : "Chronometer"}</p>
            </div>
          )}

          <div className="w-full text-center select-none">
            <p className="font-mono font-black leading-none tracking-tight text-white text-[10vh] sm:text-[12vh] md:text-[13vh]" style={{ letterSpacing: "-0.04em", textShadow: "0 0 80px rgba(255,255,255,0.08)" }}>
              {timerSystemMode === "pomodoro" ? formatTimer(secondsLeft) : chronometerDisplay}
            </p>
          </div>

          {timerSystemMode === "pomodoro" ? (
            <div className="grid grid-cols-3 gap-1.5 w-full max-w-[420px]">
              <button onClick={toggleTimer} className={timerButtonClass} style={{ ...glassPill, color: "rgba(255,255,255,0.92)" }}>{timerRunning ? "Pause" : "Start"}</button>
              <button onClick={resetTimer} className={timerButtonClass} style={{ ...glassPill, color: "rgba(255,255,255,0.92)" }}>Reset</button>
              <button onClick={skipCycle} className={timerButtonClass} style={{ ...glassPill, color: "rgba(255,255,255,0.92)" }}>Next</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[420px]">
              <button
                onClick={() => {
                  if (chronoBreakRemaining > 0) return;
                  if (chronoRunning) {
                    setChronoRunning(false);
                    setChronoBreakRemaining(timerDurations.shortBreak);
                    return;
                  }
                  setChronoRunning(true);
                }}
                disabled={chronoBreakRemaining > 0}
                className={timerButtonClass}
                style={{
                  ...glassPill,
                  color: chronoBreakRemaining > 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.92)",
                }}
              >
                {chronoBreakRemaining > 0 ? `Break ${formatTimer(chronoBreakRemaining)}` : chronoRunning ? "Pause" : "Start"}
              </button>
              <button
                onClick={() => {
                  setChronoRunning(false);
                  setChronoBreakRemaining(0);
                  if (chronoElapsedSeconds > 0) {
                    logFocusMinutes(Math.max(1, Math.round(chronoElapsedSeconds / 60)));
                  }
                  setChronoElapsedSeconds(0);
                }}
                className={timerButtonClass}
                style={{ ...glassPill, color: "rgba(255,255,255,0.92)" }}
              >
                Finish
              </button>
            </div>
          )}

          <div className="text-center">
            <p className="label" style={{ color: "rgba(255,255,255,0.3)" }}>Cycles</p>
            <p className="font-mono text-2xl font-bold" style={{ color: "rgba(255,255,255,0.76)" }}>{focusCyclesCompleted}</p>
          </div>
        </section>

        <section className="w-full pb-24" style={{ marginTop: appTab === "review" ? 0 : "0.5rem" }}>
          {appTab !== "review" && (
          <div className="w-full max-w-6xl mx-auto flex flex-col items-center">
            <div className="w-full flex justify-between items-end mb-4">
              <div>
                <p className="font-semibold" style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Study hours</p>
                <p className="label mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>january to december</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold" style={{ fontSize: "1.6rem", color: "rgba(255,255,255,0.65)" }}>{formatMinutesAsHours(totalMinutes)}</p>
                <p className="label" style={{ color: "rgba(255,255,255,0.22)" }}>total (h)</p>
              </div>
            </div>

            <Heatmap2D studyLogs={focusStudyLogs} todayKey={todayKey} />

            <div className="mt-5 flex items-center justify-center">
              <button onClick={() => setShow3D((value) => !value)} className="label rounded-full px-5 py-2" style={{ ...glassGhost, color: "rgba(255,255,255,0.48)" }}>
                {show3D ? "Hide details" : "Show details"}
              </button>
            </div>

            {show3D && (
              <div className="mt-4 w-full">
                <Heatmap3D studyLogs={focusStudyLogs} />
              </div>
            )}
          </div>
          )}

          {appTab === "tasks" && (
            <div className="mt-8 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "2rem" }}>
              <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Tasks</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_90px]">
                <input value={taskInput} onChange={(e) => setTaskInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addTask(taskInput, priorityInput); setTaskInput(""); } }} placeholder="New task..." className="rounded-2xl px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/20" style={glassGhost} />
                <select
                  value={priorityInput}
                  onChange={(e) => setPriorityInput(e.target.value as "high" | "medium" | "low")}
                  className="rounded-2xl px-3 py-2.5 text-sm outline-none cursor-pointer"
                  style={{ ...glassGhost, background: "rgba(14,16,26,0.92)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.14)" }}
                >
                  <option value="high" style={{ background: "#0e101a", color: "#f4f6ff" }}>High</option>
                  <option value="medium" style={{ background: "#0e101a", color: "#f4f6ff" }}>Medium</option>
                  <option value="low" style={{ background: "#0e101a", color: "#f4f6ff" }}>Low</option>
                </select>
                <button onClick={() => { addTask(taskInput, priorityInput); setTaskInput(""); }} className="label rounded-2xl px-3 py-2.5 text-white" style={glassPill}>Add</button>
              </div>

              <div className="scroll-slim max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {sortedTasks.map((task) => (
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
                        aria-label={task.completed ? "Uncheck" : "Mark as done"}
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
                        aria-label="Delete task"
                        title="Delete task"
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
              <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Sound Module</h3>

              <div className="grid gap-2 sm:grid-cols-3">
                {ambientTracks.map((track) => (
                  <button key={track.youtubeId} onClick={() => setTrack(track.youtubeId)} className="rounded-2xl px-3 py-2.5 text-left text-sm" style={{ ...(currentTrackId === track.youtubeId ? glassActive : glassGhost), color: currentTrackId === track.youtubeId ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)" }}>
                    {track.title}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_120px]">
                <input value={soundInput} onChange={(e) => setSoundInput(e.target.value)} placeholder="Paste URL (YouTube, Spotify, radio, mp3...)" className="rounded-2xl px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25" style={glassGhost} />
                <button onClick={() => setCustomSoundUrl(soundInput)} className="label rounded-2xl px-3 py-2.5 text-white" style={glassPill}>Apply URL</button>
                <button
                  onClick={() => {
                    setCustomSoundUrl("");
                    setSoundInput("");
                  }}
                  className="label rounded-2xl px-3 py-2.5"
                  style={{ ...glassGhost, color: "rgba(255,255,255,0.62)" }}
                >
                  Remove URL
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setSoundAutoplay((value) => !value)} className="label rounded-full px-4 py-2" style={{ ...glassGhost, color: "rgba(255,255,255,0.52)" }}>{soundAutoplay ? "Autoplay ON" : "Autoplay OFF"}</button>
                <button onClick={() => setSoundReloadSeed((value) => value + 1)} className="label rounded-full px-4 py-2" style={{ ...glassGhost, color: "rgba(255,255,255,0.52)" }}>Reload</button>
              </div>

            </div>
          )}

          {appTab === "journal" && (
            <div className="mt-8 space-y-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "2rem" }}>
              <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Calendar & Notes</h3>

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
                    {["S", "M", "T", "W", "T", "F", "S"].map((label, idx) => (
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
                  <p className="label" style={{ color: "rgba(255,255,255,0.28)" }}>Study time: {formatMinutesAsHours(selectedDayMinutes)}</p>
                  <textarea rows={12} value={selectedNote} onChange={(e) => setDailyNote(selectedDateKey, e.target.value)} placeholder="Write notes for the day" className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none resize-none placeholder:text-white/25" style={glassGhost} />
                </div>
              </div>
            </div>
          )}

          {appTab === "review" && (
            <div className="w-full pt-1 sm:pt-0 review-zoom">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 px-1 gap-2 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold tracking-wide" style={{ color: "rgba(255,255,255,0.8)" }}>Study Review</h2>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Track your revision schedule</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={glassGhost}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "rgba(255,255,255,0.6)" }}>
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <input
                      value={reviewSearch}
                      onChange={(e) => setReviewSearch(e.target.value)}
                      placeholder="Search block or topic"
                      className="w-44 bg-transparent text-xs text-white outline-none placeholder:text-white/30"
                    />
                  </div>
                  <button
                    onClick={() => addReviewBlock()}
                    className="label rounded-full px-4 py-2 text-white text-xs"
                    style={glassPill}
                  >
                    + Add Block
                  </button>
                </div>
              </div>

              {/* Blocks */}
              {reviewBlocks.length > 0 && (
                <div className="grid grid-cols-1 gap-6">
                  {sortedReviewBlocks.map((block) => {
                      const topicSubject = block.subjects[0];
                      const fronts = topicSubject?.fronts ?? [];
                      const isCollapsed = Boolean(collapsedBlocks[block.id]);
                      const blockMatched = reviewSearchMatches.blockMatches.has(block.id);
                      const blockInput = reviewBlockInputs[block.id] ?? { topic: "" };
                      const setBlockInput = (patch: Partial<typeof blockInput>) =>
                        setReviewBlockInputs((prev) => ({ ...prev, [block.id]: { ...blockInput, ...patch } }));

                      return (
                        <div key={block.id} className="w-full" ref={(node) => { blockCardRefs.current[block.id] = node; }}>
                          <div
                            className="rounded-2xl overflow-x-auto"
                            style={{
                              ...glassGhost,
                              border: "1px solid rgba(255,255,255,0.1)",
                              boxShadow:
                                focusedReviewItem === block.id || blockMatched
                                  ? "0 0 0 1px rgba(255,255,255,0.45), 0 0 24px rgba(255,255,255,0.08)"
                                  : undefined,
                            }}
                          >
                            <table className="w-full border-collapse" style={{ minWidth: 600 }}>
                              <thead>
                                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                  <th colSpan={4} className="px-3 py-2 text-left">
                                    <div className="flex items-center justify-between gap-2">
                                      <div>
                                        {editingBlockId === block.id ? (
                                          <input
                                            autoFocus
                                            defaultValue={block.name}
                                            onBlur={(e) => {
                                              updateReviewBlockName(block.id, e.target.value || block.name);
                                              setEditingBlockId(null);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                updateReviewBlockName(block.id, e.currentTarget.value || block.name);
                                                setEditingBlockId(null);
                                              }
                                              if (e.key === "Escape") setEditingBlockId(null);
                                            }}
                                            className="bg-transparent text-sm font-semibold outline-none border-b w-40"
                                            style={{ color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.3)" }}
                                          />
                                        ) : (
                                          <button onClick={() => setEditingBlockId(block.id)} className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                                            {block.name}
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() =>
                                          setCollapsedBlocks((prev) => ({
                                            ...prev,
                                            [block.id]: !prev[block.id],
                                          }))
                                        }
                                        className="h-6 w-6 flex items-center justify-center rounded-full"
                                        style={{ ...glassGhost, color: "rgba(255,255,255,0.72)" }}
                                        title={isCollapsed ? "Expand block" : "Collapse block"}
                                        aria-label={isCollapsed ? "Expand block" : "Collapse block"}
                                      >
                                        <svg
                                          width="11"
                                          height="11"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}
                                        >
                                          <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() => removeReviewBlock(block.id)}
                                        className="h-6 w-6 flex items-center justify-center rounded-full"
                                        style={{ ...glassGhost, color: "rgba(255,100,100,0.7)" }}
                                        title="Delete block"
                                      >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 5L5 19M5 5l14 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                                      </button>
                                    </div>
                                    </div>
                                  </th>
                                </tr>
                                {!isCollapsed && (
                                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                    <th className="text-left px-3 py-3 text-sm font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>Topic</th>
                                    <th className="text-center px-3 py-3 text-sm font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)", width: 180, borderRight: "1px solid rgba(255,255,255,0.05)" }}>Weekly</th>
                                    <th className="text-center px-3 py-3 text-sm font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)", width: 120, borderRight: "1px solid rgba(255,255,255,0.05)" }}>Biweekly</th>
                                    <th className="text-center px-3 py-3 text-sm font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)", width: 110 }}>Monthly</th>
                                  </tr>
                                )}
                              </thead>
                              {!isCollapsed && <tbody>
                                {fronts.map((front) => (
                                  <tr
                                    key={front.id}
                                    draggable
                                    ref={(node) => {
                                      topicRowRefs.current[`${block.id}::${front.id}`] = node;
                                    }}
                                    onDragStart={() => setDragTopic({ blockId: block.id, frontId: front.id })}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => {
                                      if (!dragTopic) return;
                                      if (dragTopic.blockId !== block.id) {
                                        const toIndex = fronts.findIndex((item) => item.id === front.id);
                                        moveTopicAcrossBlocks(dragTopic.blockId, block.id, dragTopic.frontId, toIndex < 0 ? fronts.length : toIndex);
                                        setDragTopic(null);
                                        return;
                                      }
                                      const fromIndex = fronts.findIndex((item) => item.id === dragTopic.frontId);
                                      const toIndex = fronts.findIndex((item) => item.id === front.id);
                                      if (fromIndex >= 0 && toIndex >= 0) {
                                        moveTopicInBlock(block.id, fromIndex, toIndex);
                                      }
                                      setDragTopic(null);
                                    }}
                                    onDragEnd={() => setDragTopic(null)}
                                    style={{
                                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                                      background:
                                        focusedReviewItem === `${block.id}::${front.id}` || reviewSearchMatches.topicMatches.has(`${block.id}::${front.id}`)
                                          ? "rgba(255,255,255,0.08)"
                                          : undefined,
                                    }}
                                  >
                                    <td className="px-3 py-2 text-base" style={{ color: "rgba(255,255,255,0.72)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
                                      <div
                                        className="group flex items-center gap-2"
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          setTopicEditor({
                                            blockId: block.id,
                                            frontId: front.id,
                                            title: front.title,
                                            detail: front.detail ?? "",
                                            color: front.color,
                                            x: e.clientX,
                                            y: e.clientY,
                                          });
                                        }}
                                      >
                                        <span
                                          aria-hidden
                                          style={{
                                            width: 8,
                                            height: 8,
                                            minWidth: 8,
                                            borderRadius: 999,
                                            background: topicColorToHex(front.color),
                                            boxShadow: `0 0 0 1px ${topicColorToHex(front.color)}55`,
                                          }}
                                        />
                                        <span>{front.title}</span>
                                        {front.detail && (
                                          <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs opacity-0 transition-all duration-200 group-hover:max-w-[280px] group-hover:opacity-75" style={{ color: "rgba(255,255,255,0.56)" }}>
                                            {`: ${front.detail}`}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    {(["weekly", "biweekly", "monthly"] as const).map((period) => (
                                      <td key={period} className="text-center px-3 py-2" style={{ borderRight: period !== "monthly" ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
                                        <div className="flex flex-wrap items-center justify-center gap-1">
                                          {front.checks[period].map((checked, checkIndex) => (
                                            <button
                                              key={`${front.id}-${period}-${checkIndex}`}
                                              onClick={() => {
                                                toggleTopicCheck(block.id, front.id, period, checkIndex);
                                                playCheckBeep();
                                              }}
                                              className="rounded-[3px] flex items-center justify-center transition-all duration-150 shrink-0"
                                              style={{
                                                width: 17,
                                                minWidth: 17,
                                                maxWidth: 17,
                                                height: 17,
                                                minHeight: 17,
                                                maxHeight: 17,
                                                boxSizing: "border-box",
                                                background: checked ? "#22C55E" : "rgba(255,255,255,0.04)",
                                                border: checked ? "1px solid #22C55E" : "1px solid rgba(255,255,255,0.18)",
                                              }}
                                              aria-label={`Toggle ${period} ${checkIndex + 1}`}
                                            >
                                              {checked && (
                                                <svg width="10" height="9" viewBox="0 0 12 9" fill="none">
                                                  <path d="M1 4L4.5 7.5L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                              )}
                                            </button>
                                          ))}
                                        </div>
                                      </td>
                                    ))}
                                  </tr>
                                ))}

                                <tr
                                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => {
                                    if (!dragTopic) return;
                                    if (dragTopic.blockId !== block.id) {
                                      moveTopicAcrossBlocks(dragTopic.blockId, block.id, dragTopic.frontId, fronts.length);
                                      setDragTopic(null);
                                      return;
                                    }
                                    const fromIndex = fronts.findIndex((item) => item.id === dragTopic.frontId);
                                    if (fromIndex >= 0 && fromIndex !== fronts.length - 1) {
                                      moveTopicInBlock(block.id, fromIndex, fronts.length - 1);
                                    }
                                    setDragTopic(null);
                                  }}
                                >
                                  <td colSpan={4} className="px-2 py-2">
                                    <div className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 102px" }}>
                                      <div className="flex min-w-0 gap-2 items-center">
                                      <input
                                        type="text"
                                        value={blockInput.topic}
                                        onChange={(e) => setBlockInput({ topic: e.target.value })}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && blockInput.topic.trim()) {
                                            addTopicToBlock(block.id, blockInput.topic.trim());
                                            setBlockInput({ topic: "" });
                                          }
                                        }}
                                        placeholder="Add topic..."
                                        className="flex-1 rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-white/20"
                                        style={glassGhost}
                                      />
                                      </div>
                                      <button
                                        onClick={() => {
                                          if (blockInput.topic.trim()) {
                                            addTopicToBlock(block.id, blockInput.topic.trim());
                                            setBlockInput({ topic: "" });
                                          }
                                        }}
                                        className="w-full rounded-lg px-3 py-1.5 text-xs text-white"
                                        style={glassPill}
                                      >
                                        + Topic
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              </tbody>}
                            </table>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {reviewBlocks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No blocks yet. Add your first study block.</p>
                  <button onClick={() => addReviewBlock()} className="label rounded-full px-5 py-2 text-white" style={glassPill}>+ Add Block</button>
                </div>
              )}
            </div>
          )}

          {topicEditor && (
            <div
              className="fixed z-50 rounded-xl p-3 min-w-[220px]"
              style={{
                ...glassPill,
                left: topicEditor.x + 8,
                top: topicEditor.y + 8,
                background: "rgba(10,10,18,0.95)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>Edit topic</p>
              <input
                value={topicEditor.title}
                onChange={(e) => setTopicEditor((prev) => (prev ? { ...prev, title: e.target.value } : null))}
                className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white outline-none mb-2"
                style={glassGhost}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyTopicEditorChanges(topicEditor.blockId, topicEditor.frontId, {
                      title: topicEditor.title,
                      detail: topicEditor.detail,
                      color: topicEditor.color,
                    });
                    setTopicEditor(null);
                  }
                  if (e.key === "Escape") {
                    setTopicEditor(null);
                  }
                }}
              />
              <label className="block text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                Add detail
              </label>
              <input
                value={topicEditor.detail}
                onChange={(e) => setTopicEditor((prev) => (prev ? { ...prev, detail: e.target.value } : null))}
                className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white outline-none mb-2"
                style={glassGhost}
                placeholder="Extra context for this topic"
              />
              <div className="flex items-center gap-2 mb-2">
                {TOPIC_COLOR_OPTIONS.map((colorOption) => {
                  const active = topicEditor.color === colorOption.id;
                  return (
                    <button
                      key={`editor-${colorOption.id}`}
                      type="button"
                      onClick={() => setTopicEditor((prev) => (prev ? { ...prev, color: colorOption.id } : null))}
                      className="rounded-full"
                      style={{
                        width: 13,
                        height: 13,
                        minWidth: 13,
                        background: colorOption.value,
                        boxShadow: active ? `0 0 0 1.5px ${colorOption.value}, 0 0 0 3px rgba(255,255,255,0.3)` : `0 0 0 1px ${colorOption.value}66`,
                      }}
                      aria-label={`Set ${colorOption.label} color`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    removeTopicFromBlock(topicEditor.blockId, topicEditor.frontId);
                    setTopicEditor(null);
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs"
                  style={{ ...glassGhost, color: "rgba(255,120,120,0.95)", borderColor: "rgba(255,120,120,0.45)" }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setTopicEditor(null)}
                  className="rounded-lg px-2.5 py-1 text-xs"
                  style={{ ...glassGhost, color: "rgba(255,255,255,0.68)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyTopicEditorChanges(topicEditor.blockId, topicEditor.frontId, {
                      title: topicEditor.title,
                      detail: topicEditor.detail,
                      color: topicEditor.color,
                    });
                    setTopicEditor(null);
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs text-white"
                  style={glassPill}
                >
                  Save
                </button>
              </div>
            </div>
          )}
          {/* Always-mounted player — key only changes on URL/reload, never on tab switch */}
          {shouldShowAmbientPlayer && (
            <AmbientPlayer
              appTab={appTab}
              resolvedCustomSound={resolvedCustomSound}
              customSoundSrc={customSoundSrc}
              fallbackSoundSrc={fallbackSoundSrc}
              soundAutoplay={soundAutoplay}
              soundReloadSeed={soundReloadSeed}
              onClose={() => {
                setTrack("");
                setCustomSoundUrl("");
                setSoundInput("");
              }}
            />
          )}
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
                  setTab(item.id as typeof appTab);
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
          key={`${timerDurations.focus}-${timerDurations.shortBreak}-${timerDurations.longBreak}-${customMotivationalPhrase}-${reviewCheckConfig.weekly}-${reviewCheckConfig.biweekly}-${reviewCheckConfig.monthly}-${beepVolume}-${timerBeepEnabled}-${reviewBeepEnabled}`}
          onClose={() => setSettingsOpen(false)}
          focusMinutes={Math.round(timerDurations.focus / 60)}
          shortBreakMinutes={Math.round(timerDurations.shortBreak / 60)}
          longBreakMinutes={Math.round(timerDurations.longBreak / 60)}
          reviewChecklist={reviewCheckConfig}
          beepVolume={beepVolume}
          timerBeepEnabled={timerBeepEnabled}
          reviewBeepEnabled={reviewBeepEnabled}
          timerSystemMode={timerSystemMode}
          motivationalPhrase={customMotivationalPhrase}
          onResetHeatmaps={() => {
            resetAnalytics();
          }}
          onSave={(payload) => {
            updateTimerDurations({ focus: payload.focus, shortBreak: payload.shortBreak, longBreak: payload.longBreak });
            setCustomMotivationalPhrase(payload.phrase);
            if (payload.mode !== "chronometer") {
              setChronoRunning(false);
              setChronoBreakRemaining(0);
            }
            setReviewCheckConfig(payload.reviewChecklist);
            setBeepVolume(payload.beepVolume);
            setTimerBeepEnabled(payload.timerBeepEnabled);
            setReviewBeepEnabled(payload.reviewBeepEnabled);
            setTimerSystemMode(payload.mode);
            setSettingsOpen(false);
          }}
        />
      )}

    </main>
  );
}
