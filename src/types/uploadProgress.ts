import { FileUploadingStatusEnum } from "@/types/file";

export type UploadProgressProps = {
  status: FileUploadingStatusEnum;
  progress: number;
  errorMessage?: string | null;
  logs?: string[];
};
