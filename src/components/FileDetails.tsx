import { formatBytes } from "@/lib/fileSize";
import { getFileType } from "@/lib/fileType";
import { Form } from "lucide-react";

type PropsType = {
  file: File | null;
};

const FileDetails = ({ file }: PropsType) => {
  if (!file) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Form className="h-4" />
        <h1>File Details</h1>
      </div>
      <div className="grid grid-cols-12 gap-2">
        <p className="col-span-1">Name :</p>
        <p className="col-span-11 text-muted-foreground">{file.name}</p>

        <p className="col-span-1">Size :</p>
        <p className="col-span-11 text-muted-foreground">
          {formatBytes(file.size)}
        </p>

        <p className="col-span-1">Type :</p>
        <p className="col-span-11 text-muted-foreground">
          {getFileType(file.name)}
        </p>
      </div>
    </div>
  );
};

export default FileDetails;
