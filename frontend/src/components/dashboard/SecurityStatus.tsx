import { ShieldCheck, Server, Lock, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";

export function SecurityStatus() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <ShieldCheck className="mr-2 h-5 w-5 text-emerald-500" />
          Security Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Server className="mr-3 h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">S3 Storage Enclave</p>
                <p className="text-xs text-muted-foreground">Encrypted at rest (KMS)</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">Secure</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Lock className="mr-3 h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">Access Controls</p>
                <p className="text-xs text-muted-foreground">MFA Enforcement Active</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">Active</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="mr-3 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Audit Logging</p>
                <p className="text-xs text-muted-foreground">CloudTrail Integration</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full border border-primary/20">Logging</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
