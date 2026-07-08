"use client";

import FileDetails from "@/components/FileDetails";
import UploadProgress from "@/components/UploadProgress";
import { Button } from "@/components/ui/button";
import { FileUploadingStatusEnum, UploadFileItem } from "@/types/file";
import { Pause, Play, Trash2, Upload, X } from "lucide-react";

type PropsType = {
  item: UploadFileItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onRemove?: (id: string) => void;
};

const UploadFileListItem = ({
  item,
  onCancel,
  onRetry,
  onPause,
  onResume,
  onRemove,
}: PropsType) => {
  const { id, file, status, progress, errorMessage, logs } = item;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/3 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <FileDetails file={file} />

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
            (status === FileUploadingStatusEnum.IDlE ||
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
