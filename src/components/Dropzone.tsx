"use client";

import React, { Dispatch, SetStateAction, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import FileDetails from "./FileDetails";

type PropsType = {
  onSetFile: Dispatch<SetStateAction<File | null>>;
  file: File | null;
};

const Dropzone = ({ onSetFile, file }: PropsType) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onSetFile(acceptedFiles[0]);
    },
    [onSetFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div
      {...getRootProps()}
      className="border border-primary border-dashed p-5 rounded-xl flex justify-center min-h-36 items-center"
    >
      <input {...getInputProps()} />
      {isDragActive && <p className="text-xl">Drop the files here ...</p>}
      {!isDragActive && !file && (
        <p className="text-xl">
          Drag &apos;n&apos; drop some files here, or click to select files
        </p>
      )}
      {!isDragActive && file && <FileDetails file={file} />}
    </div>
  );
};

export default Dropzone;
