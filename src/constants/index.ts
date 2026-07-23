import { FileType, FileUploadingStatusEnum } from "@/types/file";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Cpu,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  GitMerge,
  ListOrdered,
  Loader2,
  PauseCircle,
  Send,
} from "lucide-react";

// Dropzone
export const DEFAULT_MAX_SIZE = 20 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 20;

// File details
export const FILE_TYPE_ICON: Record<FileType, typeof File> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: FileText,
  archive: FileArchive,
  text: FileCode,
  unknown: File,
};

// Upload progress
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

// Retry
export const DEFAULT_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 500;
export const DEFAULT_MAX_DELAY_MS = 8000;

// Cloudinary
export const CLOUDINARY_MIN_CHUNK_SIZE = 6 * 1024 * 1024;
export const CLOUDINARY_WORKER_POOL_CONCURRENCY = 4;
export const CLOUDINARY_SIGN_ENDPOINT = "/cloudinary/sign";
export const CLOUDINARY_SAVE_ENDPOINT = "/cloudinary/save";

// Strategy tab
export const STRATEGY_LIST = [
  {
    title: "Traditional",
    path: "/",
    icon: Send,
  },
  {
    title: "Chunk · Sequential",
    path: "/chunk/sequential",
    icon: ListOrdered,
  },
  {
    title: "Chunk · Worker Pool",
    path: "/chunk/worker-pool",
    icon: Cpu,
  },
  {
    title: "Cloudinary · Worker Pool",
    path: "/chunk/cloudinary",
    icon: Cloud,
  },
];

// Network
export const DEFAULT_CONCURRENCY = 5;

// Local Storage
export const STORAGE_KEY_PREFIX = "upload-resume:";

// Index DB

export const DB_NAME = "cloudinary-uploads";
export const STORE_NAME = "cloudinary-uploads";
export const DB_VERSION = 1;
