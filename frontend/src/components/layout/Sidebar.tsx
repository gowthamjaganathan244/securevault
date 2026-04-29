"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, UploadCloud, FolderLock, ShieldAlert, Users, ShieldCheck, X } from "lucide-react";
import { useAuth } from "react-oidc-context";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Upload File", href: "/upload", icon: UploadCloud },
  { name: "All Files", href: "/files", icon: FolderLock },
  { name: "Audit Logs", href: "/audit-logs", icon: ShieldAlert },
  { name: "Admin Users", href: "/admin-users", icon: Users },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const auth = useAuth();
  
  // Extract groups, handle possible undefined/string/array
  const groupsRaw = auth.user?.profile?.["cognito:groups"];
  const groups: string[] = Array.isArray(groupsRaw) 
    ? groupsRaw 
    : (typeof groupsRaw === 'string' ? [groupsRaw] : []);
    
  const isAdmin = groups.includes("Admin");
  const isAuditor = groups.includes("Auditor");
  const isUser = groups.includes("User") || (!isAdmin && !isAuditor);

  const filteredNavItems = navItems.filter(item => {
    if (isAdmin) return true; // Admin sees all
    if (isAuditor) {
      // Auditor sees only audit logs
      return item.href === "/audit-logs";
    }
    if (isUser) {
      // User sees upload and all files
      return item.href === "/upload" || item.href === "/files";
    }
    return false;
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 transform flex-col border-r border-white/5 bg-card/95 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:flex h-full",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center justify-between px-6 border-b border-white/5">
          <div className="flex items-center">
            <ShieldCheck className="h-6 w-6 text-primary mr-2" />
            <span className="text-lg font-bold tracking-tight text-foreground">SecureVault</span>
          </div>
          {/* Mobile close button */}
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-6 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/5">
          <div className="rounded-lg bg-emerald-500/10 p-4 border border-emerald-500/20">
            <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">System Status</p>
            <div className="flex items-center text-sm text-emerald-400">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Operational
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
