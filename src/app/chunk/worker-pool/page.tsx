"use client";

import Dropzone from "@/components/Dropzone";
import { Button } from "@/components/ui/button";
import useFileUploadChunkedWorkerPool from "@/hooks/useFileUploadChunkedWorkerPool";
import { FileUploadingStatusEnum } from "@/types/file";
import { Pause, Play, Upload, X } from "lucide-react";

const Home = () => {
  const {
    file,
    status,
    setFile,
    handleUpload,
    handlePause,
    handleResume,
    handleCancel,
  } = useFileUploadChunkedWorkerPool();

  return (
    <div className="flex flex-col gap-6 p-5">
      <Dropzone onSetFile={setFile} file={file} />

      {file && (
        <div className="flex items-center justify-end gap-4">
          {(status === FileUploadingStatusEnum.IDlE ||
            status === FileUploadingStatusEnum.ERROR) && (
            <Button onClick={handleUpload}>
              <Upload />
              Upload
            </Button>
          )}

          {status === FileUploadingStatusEnum.UPLOADING && (
            <Button variant="secondary" onClick={handlePause}>
              <Pause />
              Pause
            </Button>
          )}

          {status === FileUploadingStatusEnum.PAUSED && (
            <Button onClick={handleResume}>
              <Play />
              Resume
            </Button>
          )}

          <Button variant="destructive" onClick={handleCancel}>
            <X />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
};

export default Home;
