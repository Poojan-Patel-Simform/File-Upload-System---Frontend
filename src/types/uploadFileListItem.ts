import { UploadFileItem } from "@/types/file";

// The optional callbacks below gate their corresponding button's visibility
// directly (composition over boolean props) — a page opts in/out of
// pause/resume/remove/resume-detection UI simply by omitting the prop,
// rather than passing separate showPause/showResume/etc. booleans.
export type UploadFileListItemProps = {
  item: UploadFileItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onRemove?: (id: string) => void;
  onResumeDetected?: (id: string) => void;
  onStartFresh?: (id: string) => void;
};
