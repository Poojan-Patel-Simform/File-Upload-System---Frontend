"use client";

import FileDetails from "@/components/FileDetails";
import UploadProgress from "@/components/UploadProgress";
import { Button } from "@/components/ui/button";
import { FileUploadingStatusEnum, UploadFileItem } from "@/types/file";
import { History, Pause, Play, RotateCcw, Trash2, Upload, X } from "lucide-react";

// The optional callbacks below gate their corresponding button's visibility
// directly (composition over boolean props) — a page opts in/out of
// pause/resume/remove/resume-detection UI simply by omitting the prop,
// rather than passing separate showPause/showResume/etc. booleans.
type PropsType = {
  item: UploadFileItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onRemove?: (id: string) => void;
  onResumeDetected?: (id: string) => void;
  onStartFresh?: (id: string) => void;
};

const UploadFileListItem = ({
  item,
  onCancel,
  onRetry,
  onPause,
  onResume,
  onRemove,
  onResumeDetected,
  onStartFresh,
}: PropsType) => {
  const { id, file, status, progress, errorMessage, logs, resumableUploadId } =
    item;

  // Both onResumeDetected and onStartFresh must be provided for this branch
  // to trigger — if either is missing, a resumableUploadId is silently
  // ignored and the normal card below renders instead.
  if (resumableUploadId && onResumeDetected && onStartFresh) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
        <FileDetails file={file} />

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="size-4 shrink-0 text-primary" />
          Resumable upload detected from a previous session.
        </p>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onResumeDetected(id)}>
            <Upload />
            Resume
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onStartFresh(id)}
          >
            <RotateCcw />
            Start Fresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/3 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <FileDetails file={file} />

        {/* Multi-branch on status — more than one button can render at once,
            e.g. UPLOADING shows Pause + Cancel together. */}
        <div className="flex shrink-0 items-center gap-2">
          {status === FileUploadingStatusEnum.ERROR && (
            <Button size="sm" onClick={() => onRetry(id)}>
              <Upload />
              Retry
            </Button>
          )}

          {status === FileUploadingStatusEnum.UPLOADING && onPause && (
            <Button size="sm" variant="secondary" onClick={() => onPause(id)}>
              <Pause />
              Pause
            </Button>
          )}

          {status === FileUploadingStatusEnum.PAUSED && onResume && (
            <Button size="sm" onClick={() => onResume(id)}>
              <Play />
              Resume
            </Button>
          )}

          {status !== FileUploadingStatusEnum.COMPLETED && (
            <Button size="sm" variant="destructive" onClick={() => onCancel(id)}>
              <X />
              Cancel
            </Button>
          )}

          {onRemove &&
            (status === FileUploadingStatusEnum.IDLE ||
              status === FileUploadingStatusEnum.COMPLETED) && (
              <Button size="icon-sm" variant="ghost" onClick={() => onRemove(id)}>
                <Trash2 />
              </Button>
            )}
        </div>
      </div>

      <UploadProgress
        status={status}
        progress={progress}
        errorMessage={errorMessage}
        logs={logs}
      />
    </div>
  );
};

export default UploadFileListItem;
