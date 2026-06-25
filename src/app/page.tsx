"use client";

import Dropzone from "@/components/Dropzone";
import { Button } from "@/components/ui/button";
import useHash from "@/hooks/useHash";
import { generateFileChunks } from "@/lib/fileProcess";
import { Upload, X } from "lucide-react";

import { useState } from "react";

const Home = () => {
  const [file, setFile] = useState<File | null>(null);
  const { handleGetHash } = useHash();

  const handleUpload = async () => {
    if (!file) return;

    const chunks = generateFileChunks(file);
    const hash = await handleGetHash(file);
  };
  return (
    <div className="flex flex-col gap-6">
      <Dropzone onSetFile={setFile} file={file} />
      {file && (
        <div className="flex items-center justify-end gap-4">
          <Button onClick={handleUpload}>
            <Upload />
            Upload
          </Button>
          <Button variant="destructive" onClick={() => setFile(null)}>
            <X />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
};

export default Home;
