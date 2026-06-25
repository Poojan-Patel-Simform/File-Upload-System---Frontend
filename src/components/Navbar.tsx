import { Upload } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="p-5 border-b border-primary flex items-center justify-between flex-wrap">
      <div className="flex items-center gap-4 text-primary">
        <Upload />
        <h1 className="text-2xl">UploadLab</h1>
      </div>
      <p>A strategy comparison sandbox</p>
    </nav>
  );
};

export default Navbar;
