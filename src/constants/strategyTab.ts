import { Send, ListOrdered, Cpu, Cloud } from "lucide-react";

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
  {
    title: "Cloudinary · Worker Pool",
    path: "/chunk/cloudinary",
    icon: Cloud,
  },
];
