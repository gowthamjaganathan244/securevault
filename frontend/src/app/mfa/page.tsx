"use client";

import { Smartphone, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MFAPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      router.push("/dashboard");
    }, 800);
  };

  return (
    <Card className="glass-panel w-full shadow-2xl border-white/10">
      <CardHeader className="space-y-3 text-center pb-8 pt-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20 mb-2">
          <Smartphone className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight text-foreground">Two-Factor Auth</CardTitle>
        <CardDescription className="text-muted-foreground">
          Enter the code from your authenticator app
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-10 px-8 space-y-6">
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <Input 
              type="text" 
              placeholder="000 000" 
              className="text-center tracking-[0.5em] text-2xl h-14 bg-black/20 border-white/10 focus-visible:ring-primary"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              required 
            />
          </div>
          <Button 
            type="submit" 
            className="w-full bg-primary hover:bg-primary/90 text-white py-6 text-base font-semibold shadow-[0_0_15px_rgba(59,130,246,0.3)] mt-2"
            disabled={loading || code.length !== 6}
          >
            {loading ? "Verifying Token..." : "Verify Identity"}
          </Button>
        </form>
        <div className="flex flex-col items-center justify-center text-xs text-muted-foreground mt-6 space-y-2">
          <div className="flex items-center space-x-1">
            <ShieldAlert className="h-3 w-3 text-amber-500" />
            <span>Unrecognized device. Strict policy applied.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
