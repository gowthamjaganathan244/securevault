import { ClassificationLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  level: ClassificationLevel;
  className?: string;
}

export function ClassificationPill({ level, className }: Props) {
  const styles: Record<ClassificationLevel, string> = {
    Public: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    Internal: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    Confidential: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    Restricted: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        styles[level],
        className
      )}
    >
      {level}
    </span>
  );
}
