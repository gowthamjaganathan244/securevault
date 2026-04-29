"use client";

import { Shield, LockKeyhole, UserCircle, Menu, LogOut } from "lucide-react";
import { useAuth } from "react-oidc-context";

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const auth = useAuth();

  const handleLogout = async () => {
    await auth.removeUser();
    try {
      await auth.signoutRedirect();
    } catch (error) {
      console.error("Signout redirect failed", error);
      window.location.href = "/login";
    }
  };

  const userEmail = auth.user?.profile.email ?? "";
  
  const groupsRaw = auth.user?.profile?.["cognito:groups"];
  const groups: string[] = Array.isArray(groupsRaw) 
    ? groupsRaw 
    : (typeof groupsRaw === 'string' ? [groupsRaw] : []);
    
  let displayRole = "User";
  if (groups.includes("Admin")) displayRole = "Admin";
  else if (groups.includes("Auditor")) displayRole = "Auditor";

  return (
    <header className="flex h-16 items-center justify-between lg:justify-end border-b border-white/5 bg-card/30 backdrop-blur-md px-4 sm:px-6">
      <div className="lg:hidden flex items-center">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-6">
        <div className="hidden sm:flex items-center text-xs sm:text-sm text-emerald-500 font-medium bg-emerald-500/10 px-2 sm:px-3 py-1 rounded-full border border-emerald-500/20">
          <Shield className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
          Secure Session
        </div>

        <div className="hidden sm:flex items-center text-xs sm:text-sm text-primary font-medium bg-primary/10 px-2 sm:px-3 py-1 rounded-full border border-primary/20">
          <LockKeyhole className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
          MFA Enabled
        </div>

        <div className="flex items-center text-sm text-muted-foreground sm:border-l border-white/10 sm:pl-6">
          <UserCircle className="mr-2 h-6 w-6 text-foreground" />
          <div className="flex flex-col">
            <span className="text-foreground font-medium leading-none text-sm">
              {userEmail}
            </span>
            <span className="text-xs mt-1 hidden sm:inline-block">
              {displayRole}
            </span>
          </div>
        </div>

        {auth.error && (
          <div className="text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
            Error: {auth.error.message}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex items-center rounded-lg border border-white/10 px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="mr-1.5 h-4 w-4" />
          Sign out
        </button>
      </div>
    </header>
  );
}