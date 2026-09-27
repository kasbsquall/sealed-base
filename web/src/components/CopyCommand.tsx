"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

const RESET_MS = 1800;

export function CopyCommand({ command }: { command: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), RESET_MS);
  };

  return (
    <div className="command">
      <pre tabIndex={0} role="region" aria-label="Verification commands">
        {command}
      </pre>
      <button className="copy" onClick={copy}>
        {state === "copied" ? <Check size={14} weight="light" aria-hidden /> : <Copy size={14} weight="light" aria-hidden />}
        {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? "Commands copied to the clipboard" : state === "failed" ? "Copy failed, select the text instead" : ""}
      </span>
    </div>
  );
}
