import { cn } from "@/lib/utils";

interface Props {
  status: "Available" | "Processing" | "Quarantined" | "Success" | "Failed" | "Active" | "Inactive";
  className?: string;
}

export function StatusBadge({ status, className }: Props) {
  const getStyles = () => {
    switch (status) {
      case "Available":
      case "Success":
      case "Active":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Processing":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "Quarantined":
      case "Failed":
      case "Inactive":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        getStyles(),
        className
      )}
    >
      {status}
    </span>
  );
}
