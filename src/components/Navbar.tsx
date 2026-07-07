import { Upload } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="sticky top-0 z-20 border-b border-white/10 bg-background/70 px-5 py-4 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <div className=" flex flex-wrap items-center justify-between gap-4 ">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30">
              <Upload className="size-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                Upload
                <span className="bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
                  Lab
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                A strategy comparison sandbox
              </p>
            </div>
          </div>

          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
            Traditional · Sequential · Worker Pool
          </span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
