"use client";

import { ListChecks, Prohibit } from "@phosphor-icons/react";
import type { Step } from "@/lib/view";
import { pad2 } from "@/lib/format";
import { LinkOut } from "../LinkOut";
import { useReplay } from "./ReplayProvider";
import { TickBox } from "./Typed";

export interface StripField {
  label: string;
  figure: string;
  note: string;
}

/**
 * The order log of negotiation No. 6: every step with its transactions, ticked
 * as the replay types that step onto the copies above.
 */
export function OrderLog({ id, steps, strip }: { id: string; steps: Step[]; strip: StripField[] }) {
  const { slots, running, current, total } = useReplay();
  const split = steps.findIndex((s) => s.slot === "set") + 1;
  const columns = [
    { title: `On the negotiation contract, steps 1 to ${split}`, steps: steps.slice(0, split) },
    { title: `On the Base Account and the seller's API, steps ${split + 1} to ${total}`, steps: steps.slice(split) },
  ];

  return (
    <div className="paper paper-w doc">
      <div className="doc-top">
        <p className="doc-title">
          <ListChecks size="1.1em" weight="light" aria-hidden />
          Order log, No. {id}
        </p>
        <p className="lbl">Ticked as the replay types each step onto the order above</p>
      </div>
      <div className="strip log-strip">
        {strip.map((f) => (
          <div className="fld" key={f.label}>
            <span className="lbl">{f.label}</span>
            <span className="big">{f.figure}</span>
            <p>{f.note}</p>
          </div>
        ))}
        <div className="fld">
          <span className="lbl">Replay</span>
          <span className="ty-big">
            {running ? Math.max(0, current - 1) : total} of {total}
          </span>
          <p>{running ? "steps typed so far" : "steps typed onto the order"}</p>
        </div>
      </div>
      <div className="log-cols">
        {columns.map((col) => (
          <div key={col.title}>
            <h3>{col.title}</h3>
            <ol className="log" start={col.steps[0]?.n}>
              {col.steps.map((s) => {
                const state = slots[s.slot] ?? "done";
                const cls = [state === "blank" ? "is-blank" : "done", running && current === s.n ? "now" : ""]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={s.n} className={cls}>
                    <TickBox />
                    <span className="no">{pad2(s.n)}</span>
                    <div>
                      <h4>{s.title}</h4>
                      <p>
                        {s.detail.map((part, i) => (typeof part === "string" ? part : <code key={i}>{part.code}</code>))}
                      </p>
                      <div className="links">
                        {s.links.length ? (
                          s.links.map((l) => (
                            <LinkOut key={l.href} href={l.href}>
                              {l.label}
                            </LinkOut>
                          ))
                        ) : (
                          <span className="notx">
                            <Prohibit size="1.1em" weight="light" aria-hidden />
                            No transaction
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
