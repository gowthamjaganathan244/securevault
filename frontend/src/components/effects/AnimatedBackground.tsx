"use client";

import { motion } from "framer-motion";

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-background">
      {/* Subtle background glow */}
      <div className="absolute top-0 -left-1/4 w-[150%] h-[500px] bg-primary/5 blur-[120px] rounded-[100%] opacity-50" />
      <div className="absolute bottom-0 -right-1/4 w-[150%] h-[500px] bg-accent/5 blur-[120px] rounded-[100%] opacity-30" />
      
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      
      {/* Slow pulsing overlay */}
      <motion.div
        className="absolute inset-0 bg-background/50 backdrop-blur-[1px]"
        animate={{
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}
