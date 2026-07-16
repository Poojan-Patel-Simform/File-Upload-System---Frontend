import { type Accept } from "react-dropzone";

export type DropzoneProps = {
  onAddFiles: (files: File[]) => void;
  accept?: Accept;
  maxSize?: number;
  maxFiles?: number;
};
