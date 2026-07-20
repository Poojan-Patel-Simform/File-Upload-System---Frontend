"use client";

import { Progress } from "@/components/ui/progress";
import UploadLogs from "@/components/UploadLogs";
import { cn } from "@/lib/utils";
import { FileUploadingStatusEnum } from "@/types/file";
import { STATUS_META } from "@/constants";
import { AlertTriangle } from "lucide-react";

type PropsType = {
  status: FileUploadingStatusEnum;
  progress: number;
  errorMessage?: string | null;
  logs?: string[];
};

const UploadProgress = ({
  status,
  progress,
  errorMessage,
  logs = [],
}: PropsType) => {
  if (status === FileUploadingStatusEnum.IDLE) return null;

  const { label, icon: Icon, className } = STATUS_META[status];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/3 p-5">
      <div className="flex items-center justify-between text-sm">
        <span className={cn("flex items-center gap-2 font-medium", className)}>
          {/* UPLOADING and MERGING intentionally share the spin treatment —
              both represent server-side work still in progress. */}
          <Icon
            className={cn(
              "size-4",
              (status === FileUploadingStatusEnum.UPLOADING ||
                status === FileUploadingStatusEnum.MERGING) &&
                "animate-spin",
            )}
          />
          {label}
        </span>
        <span className="font-mono text-muted-foreground">{progress}%</span>
      </div>

      <Progress value={progress} />

      {errorMessage && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {errorMessage}
        </p>
      )}

      <UploadLogs logs={logs} className="mt-1" />
    </div>
  );
};

export default UploadProgress;
