"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type PropsType = {
  logs: string[];
  className?: string;
};

const UploadLogs = ({ logs, className }: PropsType) => {
  // Sentinel div at the end of the log list — scrolling it into view is a
  // simple way to keep the panel pinned to the newest line.
  const bottomRef = useRef<HTMLDivElement>(null);

  // Re-scroll every time a new log line is appended.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  // Hide the whole terminal panel rather than rendering an empty one.
  if (logs.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] font-mono text-xs text-[#c9d1d9] shadow-inner shadow-black/40",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-2 text-[#8b949e]">upload.log</span>
      </div>

      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto p-3">
        {logs.map((log, index) => (
          <p key={index} className="flex gap-2 whitespace-pre-wrap">
            <span className="select-none text-[#3fb950]">$</span>
            <span>{log}</span>
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default UploadLogs;
