import { FileUploadingStatusEnum } from "@/types/file";
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Loader2,
  PauseCircle,
} from "lucide-react";

// Status -> visual dispatch table, used instead of inline branching so each
// status's label/icon/color lives in one place.
export const STATUS_META: Record<
  FileUploadingStatusEnum,
  { label: string; icon: typeof Loader2; className: string }
> = {
  [FileUploadingStatusEnum.IDLE]: {
    label: "Idle",
    icon: Loader2,
    className: "text-muted-foreground",
  },
  [FileUploadingStatusEnum.UPLOADING]: {
    label: "Uploading",
    icon: Loader2,
    className: "text-primary",
  },
  [FileUploadingStatusEnum.PAUSED]: {
    label: "Paused",
    icon: PauseCircle,
    className: "text-yellow-400",
  },
  [FileUploadingStatusEnum.MERGING]: {
    label: "Finalizing",
    icon: GitMerge,
    className: "text-primary",
  },
  [FileUploadingStatusEnum.COMPLETED]: {
    label: "Completed",
    icon: CheckCircle2,
    className: "text-emerald-400",
  },
  [FileUploadingStatusEnum.ERROR]: {
    label: "Failed",
    icon: AlertTriangle,
    className: "text-destructive",
  },
};
