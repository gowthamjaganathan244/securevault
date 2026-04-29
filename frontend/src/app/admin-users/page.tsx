import { PageHeader } from "@/components/layout/PageHeader";
import { mockUsers } from "@/data/mockUsers";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/files/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { KeyRound, ShieldHalf, UserCog } from "lucide-react";

export default function AdminUsersPage() {
  return (
    <div className="space-y-8 pb-8">
      <PageHeader 
        title="Admin & Users" 
        subtitle="Manage access roles, MFA policies, and user sessions."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-card/40 border-primary/20">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-primary">MFA Required</p>
              <p className="text-sm text-muted-foreground">Enforced globally</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/40 border-accent/20">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-accent/10 rounded-full">
              <ShieldHalf className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="font-medium text-accent">Least Privilege</p>
              <p className="text-sm text-muted-foreground">Default deny policy</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/40 border-amber-500/20">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-amber-500/10 rounded-full">
              <UserCog className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="font-medium text-amber-500">Audit Logging</p>
              <p className="text-sm text-muted-foreground">Active for all roles</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-white/5">
              <tr>
                <th className="px-6 py-4 font-medium">User Name</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">MFA Status</th>
                <th className="px-6 py-4 font-medium">Account Status</th>
                <th className="px-6 py-4 font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {mockUsers.map((user) => (
                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{user.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                  <td className="px-6 py-4">
                    <Badge variant={user.role === "Admin" ? "default" : user.role === "Auditor" ? "secondary" : "outline"} className={user.role === "Auditor" ? "bg-accent/20 text-accent hover:bg-accent/30" : ""}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {user.mfaEnabled ? (
                      <span className="text-primary flex items-center text-xs font-medium"><KeyRound className="w-3 h-3 mr-1" /> Enabled</span>
                    ) : (
                      <span className="text-rose-500 flex items-center text-xs font-medium">Disabled</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(user.lastActive).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
