import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function SummaryCard({ title, value, icon: Icon, trend, className }: Props) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
            <span className="text-2xl font-bold">{value}</span>
            {trend && (
              <span className={cn("text-xs font-medium", trend.isPositive ? "text-emerald-500" : "text-rose-500")}>
                {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}% from last week
              </span>
            )}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
