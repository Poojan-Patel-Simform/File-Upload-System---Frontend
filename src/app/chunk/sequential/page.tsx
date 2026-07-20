"use client";

import Dropzone from "@/components/Dropzone";
import UploadFileListItem from "@/components/UploadFileListItem";
import useFileUploadChunkedSequential from "@/hooks/useFileUploadChunkedSequential";

const Home = () => {
  const {
    files,
    handleAddFiles,
    handleUpload,
    handlePause,
    handleResume,
    handleCancel,
    handleRemoveFile,
    handleResumeDetected,
    handleStartFresh,
  } = useFileUploadChunkedSequential();

  return (
    <div className="flex flex-col gap-6 px-5">
      <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/3 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
        <Dropzone onAddFiles={handleAddFiles} />
      </div>

      {files.length > 0 && (
        <div className="flex flex-col gap-4">
          {files.map((item) => (
            <UploadFileListItem
              key={item.id}
              item={item}
              onRetry={handleUpload}
              onPause={handlePause}
              onResume={handleResume}
              onCancel={handleCancel}
              onRemove={handleRemoveFile}
              onResumeDetected={handleResumeDetected}
              onStartFresh={handleStartFresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Home;
