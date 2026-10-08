"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowsOutLineHorizontal,
  IdentificationBadge,
  Intersect,
  Play,
  Prohibit,
  Receipt,
  SealCheck,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import { ExtLink } from "./ExtLink";

export type StepKind = "admit" | "miss" | "cross" | "settle" | "budget" | "pay" | "refuse";

export interface ReplayStep {
  kind: StepKind;
  title: string;
  detail: string;
  links: { label: string; href: string }[];
}

const ICONS: Record<StepKind, Icon> = {
  admit: IdentificationBadge,
  miss: ArrowsOutLineHorizontal,
  cross: Intersect,
  settle: SealCheck,
  budget: Wallet,
  pay: Receipt,
  refuse: Prohibit,
};

/** Time each step stays on screen before the next one appears. */
const STEP_MS = 900;

/**
 * Plays one real negotiation step by step, from admission to payment. Every
 * step and link comes from the committed transcripts. Without JavaScript, or
 * with reduced motion, all steps are simply shown.
 */
export function Replay({ steps }: { steps: ReplayStep[] }) {
  const [shown, setShown] = useState(steps.length);
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const play = () => {
    clearInterval(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(steps.length);
      return;
    }
    setShown(0);
    setPlaying(true);
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= steps.length) {
        clearInterval(timer.current);
        setPlaying(false);
      }
    }, STEP_MS);
  };

  // Play once, the first time the replay scrolls into view.
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShown(0);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = steps[Math.max(0, Math.min(shown, steps.length) - 1)];

  return (
    <div className="replay" ref={root}>
      <div className="replay-bar">
        <button className="replay-button" onClick={play} disabled={playing}>
          {shown >= steps.length ? (
            <ArrowCounterClockwise size={16} weight="light" aria-hidden />
          ) : (
            <Play size={16} weight="light" aria-hidden />
          )}
          {playing ? "Playing" : shown >= steps.length ? "Replay" : "Play"}
        </button>
        <span className="replay-count num" aria-hidden>
          {Math.min(shown, steps.length)} / {steps.length}
        </span>
        <span className="replay-progress" aria-hidden>
          <span style={{ transform: `scaleX(${Math.min(shown, steps.length) / steps.length})` }} />
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {shown > 0 && current ? `Step ${Math.min(shown, steps.length)} of ${steps.length}: ${current.title}` : ""}
      </p>
      <ol className="replay-steps">
        {steps.map((s, i) => {
          const Glyph = ICONS[s.kind];
          return (
            <li key={i} className={`replay-step ${s.kind}`} data-shown={i < shown}>
              <span className="n">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3>
                  <Glyph size={18} weight="light" aria-hidden />
                  {s.title}
                  {s.kind === "settle" && <span className="settle-mark" aria-hidden />}
                </h3>
                <p>{s.detail}</p>
              </div>
              <div className="replay-links">
                {s.links.map((l) => (
                  <ExtLink key={l.href} href={l.href}>
                    {l.label}
                  </ExtLink>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
