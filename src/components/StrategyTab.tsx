"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Send, ListOrdered, Cpu } from "lucide-react";

const STRATEGY_LIST = [
  {
    title: "Traditional",
    path: "/",
    icon: Send,
  },
  {
    title: "Chunk · Sequential",
    path: "/chunk/sequential",
    icon: ListOrdered,
  },
  {
    title: "Chunk · Worker Pool",
    path: "/chunk/worker-pool",
    icon: Cpu,
  },
];

const StrategyTab = () => {
  const pathName = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5 mx-5 w-fit backdrop-blur-sm">
      {STRATEGY_LIST.map((strategy) => {
        const isActive = pathName === strategy.path;
        const Icon = strategy.icon;

        return (
          <Link href={strategy.path} key={strategy.path}>
            <span
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-linear-to-r from-primary to-accent text-primary-foreground shadow-md shadow-primary/30"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {strategy.title}
            </span>
          </Link>
        );
      })}
    </div>
  );
};

export default StrategyTab;
