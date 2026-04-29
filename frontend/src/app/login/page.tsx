"use client";

import { ShieldCheck, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "react-oidc-context";

export default function LoginPage() {
  const auth = useAuth();

  const handleLogin = () => {
    auth.signinRedirect();
  };

  if (auth.isLoading) {
    return (
      <Card className="glass-panel w-full shadow-2xl border-white/10">
        <CardContent className="p-10 text-center text-muted-foreground">
          Loading authentication...
        </CardContent>
      </Card>
    );
  }

  if (auth.error) {
    return (
      <Card className="glass-panel w-full shadow-2xl border-white/10">
        <CardContent className="p-10 text-center text-red-400">
          Authentication error: {auth.error.message}
        </CardContent>
      </Card>
    );
  }

  if (auth.isAuthenticated) {
    return (
      <Card className="glass-panel w-full shadow-2xl border-white/10">
        <CardHeader className="space-y-3 text-center pb-8 pt-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20 mb-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            Already signed in
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {auth.user?.profile.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10 px-8 space-y-4">
          <Button
            onClick={() => (window.location.href = "/dashboard")}
            className="w-full bg-primary hover:bg-primary/90 text-white py-6 text-base font-semibold"
          >
            Go to Dashboard
          </Button>
          <Button
            onClick={() => auth.removeUser()}
            variant="outline"
            className="w-full py-6 text-base font-semibold"
          >
            Sign out locally
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel w-full shadow-2xl border-white/10">
      <CardHeader className="space-y-3 text-center pb-8 pt-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20 mb-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
          SecureVault
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Enterprise Secure Data Access Platform
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-10 px-8 space-y-6">
        <Button
          type="button"
          onClick={handleLogin}
          className="w-full bg-primary hover:bg-primary/90 text-white py-6 text-base font-semibold shadow-[0_0_15px_rgba(59,130,246,0.3)] mt-2"
        >
          Sign in with Cognito
        </Button>

        <div className="flex items-center justify-center text-xs text-muted-foreground mt-6 space-x-1">
          <Lock className="h-3 w-3" />
          <span>Protected by Multi-Factor Authentication</span>
        </div>
      </CardContent>
    </Card>
  );
}
