import { formatBytes } from "@/lib/fileSize";
import { getFileType } from "@/lib/fileType";
import { FileType } from "@/types/file";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";

type PropsType = {
  file: File | null;
};

const FILE_TYPE_ICON: Record<FileType, typeof File> = {
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

const FileDetails = ({ file }: PropsType) => {
  if (!file) return null;

  const fileType = getFileType(file.name);
  const Icon = FILE_TYPE_ICON[fileType];

  return (
    <div className="flex w-full items-center gap-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-accent/20 text-primary">
        <Icon className="size-6" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-medium">{file.name}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
            {formatBytes(file.size)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 capitalize">
            {fileType}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FileDetails;
