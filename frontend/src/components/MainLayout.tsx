"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, LogOut, Moon, Sun } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const pageTitles: { [key: string]: string } = {
  "/": "Dashboard Overview",
  "/accounts": "Account Management",
  "/domains": "Domain Portfolio",
  "/mass-cleaner": "Bulk DNS Cleaner",
  "/export": "Export & Reports",
  "/settings": "System Settings",
  "/users": "Users Management",
  "/sync-dashboard": "Sync Dashboard",
  "/onboarding": "Onboarding",
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("user");
    router.push("/login");
  };

  // Load theme and sidebar state from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    } else {
      document.documentElement.classList.add("dark");
    }

    const savedSidebar = localStorage.getItem("sidebarCollapsed");
    if (savedSidebar !== null) {
      setSidebarCollapsed(savedSidebar === "true");
    }
    
    setMounted(true);
  }, []);

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", String(newState));
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };
  
  // Find current title or default to segment name
  const currentTitle = pageTitles[pathname] || pathname.split("/").filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") || "Dashboard";

  // Skip layout for login page
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className={cn(
      "flex min-h-screen bg-background text-foreground font-sans transition-all duration-500",
      !mounted ? "opacity-0" : "opacity-100"
    )}>
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        onToggle={toggleSidebar} 
      />
      
      <div className={cn(
        "flex-1 flex flex-col transition-all duration-500 ease-in-out relative",
        sidebarCollapsed ? "ml-24" : "ml-72"
      )}>
        {/* Global Fixed Header */}
        <header className="sticky top-0 z-40 w-full px-8 py-4 backdrop-blur-md bg-background/40 border-b border-border flex justify-between items-center transition-all duration-300">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center shadow-lg shadow-primary/10">
                <ShieldCheck className="text-primary w-6 h-6" />
              </div>
              <span className="font-black text-2xl tracking-tighter text-foreground">
                DNS<span className="text-primary">Cleaner</span>
              </span>
            </div>
            
            <div className="h-8 w-px bg-border mx-2 hidden md:block" />
            
            <div className="hidden md:flex flex-col">
              <h1 className="text-lg font-black tracking-tight text-foreground/90">{currentTitle}</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">System Operational</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className="p-3 bg-secondary/50 hover:bg-secondary rounded-2xl border border-border text-foreground transition-all hover:scale-110 active:scale-95"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className="px-6 py-2 bg-secondary/50 rounded-2xl border border-border flex items-center gap-3">
              <div className="w-6 h-6 bg-primary/30 rounded-lg flex items-center justify-center text-[10px] font-black text-primary">AD</div>
              <span className="text-xs font-bold text-foreground/80">Admin Console</span>
            </div>
            
            <button 
              onClick={handleLogout}
              className="p-3 hover:bg-red-500/10 rounded-2xl text-muted-foreground hover:text-red-500 transition-all border border-transparent hover:border-red-500/20"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8 flex flex-col gap-8 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
