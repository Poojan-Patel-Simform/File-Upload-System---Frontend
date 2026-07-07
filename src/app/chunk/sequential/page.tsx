"use client";

import Dropzone from "@/components/Dropzone";
import UploadProgress from "@/components/UploadProgress";
import { Button } from "@/components/ui/button";
import useFileUploadChunkedSequential from "@/hooks/useFileUploadChunkedSequential";
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
    progress,
    errorMessage,
    logs,
  } = useFileUploadChunkedSequential();

  return (
    <div className="flex flex-col gap-6 px-5">
      <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/3 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
        <Dropzone onSetFile={setFile} file={file} />

        {(file || status !== FileUploadingStatusEnum.IDlE) && (
          <>
            <div className="flex items-center justify-end gap-3">
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

              {status !== FileUploadingStatusEnum.COMPLETED && (
                <Button variant="destructive" onClick={handleCancel}>
                  <X />
                  Cancel
                </Button>
              )}
            </div>
            <UploadProgress
              status={status}
              progress={progress}
              errorMessage={errorMessage}
              logs={logs}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default Home;
