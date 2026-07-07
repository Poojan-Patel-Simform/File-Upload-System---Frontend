"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STRATEGY_LIST = [
  {
    title: "Traditional",
    path: "/",
  },
  {
    title: "Chunk Upload - Sequential",
    path: "/chunk/sequential",
  },
  {
    title: "Chunk Upload - Worker Pool",
    path: "/chunk/worker-pool",
  },
];

const StrategyTab = () => {
  const pathName = usePathname();

  return (
    <div className="px-5 flex gap-4">
      {STRATEGY_LIST.map((strategy, index) => {
        return (
          <Link href={strategy.path} key={strategy.path}>
            <Button
              className={cn(
                pathName !== strategy.path && "bg-transparent border-primary",
              )}
            >
              {index + 1} . {strategy.title}
            </Button>
          </Link>
        );
      })}
    </div>
  );
};

export default StrategyTab;
