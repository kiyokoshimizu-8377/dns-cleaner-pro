"use client";

import { useEffect, useState } from "react";
import { Settings, Moon, Sun, PanelLeft } from "lucide-react";

export default function SettingsPage() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    }
    const savedSidebar = localStorage.getItem("sidebarCollapsed");
    if (savedSidebar !== null) {
      setSidebarCollapsed(savedSidebar === "true");
    }
  }, []);

  const applyTheme = (next: "light" | "dark") => {
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const applySidebar = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem("sidebarCollapsed", String(collapsed));
  };

  return (
    <div className="glass flex-1 rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
      <div className="p-10 space-y-8 max-w-2xl">
        <div className="flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          <h2 className="text-3xl font-black tracking-tight">System Settings</h2>
        </div>

        <div className="bg-secondary/40 p-6 rounded-[2rem] border border-white/5 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
            Appearance
          </h3>
          <div className="flex gap-3">
            <button
              onClick={() => applyTheme("dark")}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                theme === "dark"
                  ? "border-primary bg-primary/10"
                  : "border-white/5 bg-secondary/30"
              }`}
            >
              <Moon className="w-4 h-4" />
              <span className="text-sm font-bold">Dark</span>
            </button>
            <button
              onClick={() => applyTheme("light")}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                theme === "light"
                  ? "border-primary bg-primary/10"
                  : "border-white/5 bg-secondary/30"
              }`}
            >
              <Sun className="w-4 h-4" />
              <span className="text-sm font-bold">Light</span>
            </button>
          </div>
        </div>

        <div className="bg-secondary/40 p-6 rounded-[2rem] border border-white/5 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <PanelLeft className="w-4 h-4" /> Sidebar
          </h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sidebarCollapsed}
              onChange={(e) => applySidebar(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm font-medium">Start with collapsed sidebar</span>
          </label>
        </div>
      </div>
    </div>
  );
}
