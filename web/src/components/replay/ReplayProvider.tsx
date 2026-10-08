"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Replay of negotiation order No. 6. The server renders the final state, so
 * the page reads correctly without JavaScript and with reduced motion. Replay
 * blanks every slot, then retypes them step by step on all three copies and
 * ticks the order log in sync.
 */

export type SlotState = "blank" | "typing" | "done";

export interface ReplayStepInfo {
  n: number;
  slot: string;
  title: string;
}

interface ReplayContextValue {
  slots: Record<string, SlotState>;
  running: boolean;
  /** Step being typed, 0 before the first one; equals total when idle. */
  current: number;
  total: number;
  steps: ReplayStepInfo[];
  replay: () => void;
}

const ReplayContext = createContext<ReplayContextValue | null>(null);

/** Pause before the first step, after each step, and the longer hold after the stamp lands. */
const LEAD_MS = 260;
const STEP_GAP_MS = 420;
const STAMP_HOLD_MS = 900;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** The latest moment any typed line or stamp in this slot finishes, read from the rendered copies. */
const slotEnd = (slot: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"] [data-end]`)).reduce(
    (max, el) => Math.max(max, Number(el.dataset.end) || 0),
    0,
  );

export function ReplayProvider({ steps, children }: { steps: ReplayStepInfo[]; children: React.ReactNode }) {
  const total = steps.length;
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(total);
  const [announcement, setAnnouncement] = useState("");
  const alive = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const last = steps[total - 1];
  const finalMessage = `Replay finished. Step ${total} of ${total}: ${last.title}.`;

  const replay = useCallback(async () => {
    if (busy.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSlots({});
      setCurrent(total);
      setAnnouncement(`Shown in its final state. ${finalMessage}`);
      return;
    }
    busy.current = true;
    setRunning(true);
    setCurrent(0);
    setSlots(Object.fromEntries(steps.map((s) => [s.slot, "blank" as const])));
    setAnnouncement(`Replaying negotiation order, ${total} steps.`);
    await wait(LEAD_MS);

    for (const step of steps) {
      if (!alive.current) return;
      setCurrent(step.n);
      setSlots((prev) => ({ ...prev, [step.slot]: "typing" }));
      await nextFrame();
      const end = slotEnd(step.slot);
      const hasStamp = document.querySelector(`[data-slot="${step.slot}"] .stamp`) !== null;
      await wait(end + (hasStamp ? STAMP_HOLD_MS : STEP_GAP_MS));
      if (!alive.current) return;
      setSlots((prev) => ({ ...prev, [step.slot]: "done" }));
    }

    setCurrent(total);
    setRunning(false);
    setAnnouncement(finalMessage);
    busy.current = false;
  }, [steps, total, finalMessage]);

  return (
    <ReplayContext.Provider value={{ slots, running, current, total, steps, replay }}>
      {children}
      <p className="sr" role="status" aria-live="polite">
        {announcement}
      </p>
    </ReplayContext.Provider>
  );
}

export function useReplay() {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error("useReplay must be used inside ReplayProvider");
  return ctx;
}

/** The status line text, the same on every copy and in the log. */
export function useStatusText() {
  const { current, total, steps, running } = useReplay();
  if (running && current === 0) return "Starting the replay";
  const step = steps[Math.max(1, current) - 1];
  return `Step ${Math.max(1, current)} of ${total}: ${step.title}`;
}
