import { Send, ListOrdered, Cpu } from "lucide-react";

export const STRATEGY_LIST = [
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
