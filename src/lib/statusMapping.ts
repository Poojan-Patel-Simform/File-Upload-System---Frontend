import { FileUploadingStatusEnum, UploadStatus } from "@/types/file";

// The server has no concept of PAUSED (pause/resume is purely a client-side
// chunk-loop state), so this is the single point where server UploadStatus
// values get translated into the richer client FileUploadingStatusEnum.
export const mapServerStatusToClientStatus = (
  status: UploadStatus | string,
): FileUploadingStatusEnum => {
  switch (status) {
    case UploadStatus.NEW:
      return FileUploadingStatusEnum.IDLE;
    case UploadStatus.UPLOADING:
      return FileUploadingStatusEnum.UPLOADING;
    case UploadStatus.MERGING:
      return FileUploadingStatusEnum.MERGING;
    case UploadStatus.COMPLETED:
      return FileUploadingStatusEnum.COMPLETED;
    case UploadStatus.FAILED:
      return FileUploadingStatusEnum.ERROR;
    default:
      return FileUploadingStatusEnum.IDLE;
  }
};
