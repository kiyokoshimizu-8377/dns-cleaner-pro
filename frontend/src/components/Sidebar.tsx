"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Globe, 
  UserCircle, 
  Settings,
  Trash2,
  Activity,
  Menu,
  Users,
  CloudUpload,
  Shield
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getActiveSyncBatchesCount } from "@/lib/api";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const menuItems = [
  { name: "My Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Accounts", href: "/accounts", icon: UserCircle },
  { name: "Records", href: "/domains", icon: Globe },
  { name: "Sync Dashboard", href: "/sync-dashboard", icon: Activity, showActiveCount: true },
  { name: "Onboarding", href: "/onboarding", icon: CloudUpload },
  { name: "Mass Cleaner", href: "/mass-cleaner", icon: Trash2 },
  { name: "Users Management", href: "/users", icon: Users },
  { name: "Roles & Permissions", href: "/roles", icon: Shield },
];

export default function Sidebar({ isCollapsed, onToggle }: { isCollapsed?: boolean, onToggle?: () => void }) {
  const pathname = usePathname();
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const fetchActiveCount = async () => {
      try {
        const data = await getActiveSyncBatchesCount();
        setActiveCount(data.count || 0);
      } catch (err) {
        console.error("Failed to fetch active sync batches count", err);
      }
    };

    fetchActiveCount();
    const interval = setInterval(fetchActiveCount, 30000); // 30s poll for sidebar badge
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className={cn(
      "h-[calc(100vh-2rem)] glass rounded-[2rem] !border-none flex flex-col fixed left-4 top-4 z-50 shadow-2xl transition-all duration-500 ease-in-out overflow-hidden",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className="p-6 h-full flex flex-col">
        <div className={cn("flex items-center mb-10 px-2", isCollapsed ? "justify-center" : "justify-between")}>
          <button 
            onClick={onToggle}
            className="p-2 hover:bg-white/5 rounded-xl transition-colors text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-6 h-6 cursor-pointer" />
          </button>
        </div>

        <nav className="space-y-2 flex-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const hasBadge = item.showActiveCount && activeCount > 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 py-3.5 rounded-xl transition-all duration-300 group relative",
                  isCollapsed ? "px-0 justify-center" : "px-4",
                  isActive 
                    ? "bg-secondary/50 text-foreground" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
                title={isCollapsed ? item.name : ""}
              >
                {isActive && (
                   <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                )}
                <div className="relative">
                  <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-primary" : "group-hover:scale-110 transition-transform")} />
                  {isCollapsed && hasBadge && (
                    <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse" />
                  )}
                </div>
                {!isCollapsed && <span className="font-bold text-sm tracking-wide whitespace-nowrap">{item.name}</span>}
                {!isCollapsed && hasBadge && (
                  <span className="ml-auto px-2 py-0.5 text-[10px] font-bold text-white bg-rose-500 rounded-full animate-pulse">
                    {activeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4 pt-6">
          <Link
            href="/settings"
            className={cn(
              "flex items-center text-muted-foreground hover:text-foreground transition-all group",
              isCollapsed ? "justify-center py-3" : "gap-3 px-4 py-3"
            )}
          >
            <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-500 shrink-0" />
            {!isCollapsed && <span className="font-bold text-sm tracking-wide">Settings</span>}
          </Link>
        </div>
      </div>
    </aside>
  );
}
