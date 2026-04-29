import { AuditLog } from "@/lib/types";
import { Card } from "../ui/Card";
import { StatusBadge } from "../files/StatusBadge";
import { Badge } from "../ui/Badge";

interface Props {
  logs: AuditLog[];
}

export function AuditTable({ logs }: Props) {
  return (
    <Card className="overflow-hidden border border-white/5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-white/5">
            <tr>
              <th className="px-6 py-4 font-medium">Timestamp</th>
              <th className="px-6 py-4 font-medium">User</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Action</th>
              <th className="px-6 py-4 font-medium">Resource</th>
              <th className="px-6 py-4 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 font-medium text-muted-foreground">{log.timestamp}</td>
                <td className="px-6 py-4 text-foreground font-medium">{log.user}</td>
                <td className="px-6 py-4">
                  <Badge variant="outline" className="bg-white/5">{log.role}</Badge>
                </td>
                <td className="px-6 py-4 text-foreground">{log.action}</td>
                <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{log.resource}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={log.result} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
