"use client";

import Sidebar from "@/components/Sidebar";
import { useQuery } from "@tanstack/react-query";
import { getDomains, getAccounts } from "@/lib/api";
import { 
  Globe, 
  Users, 
  Trash2, 
  ArrowUpRight,
  Zap,
  Shield,
  Activity
} from "lucide-react";
import Link from "next/link";

export default function Dashboard() {
  const { data: domains } = useQuery({
    queryKey: ["domains"],
    queryFn: getDomains
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts
  });

  const totalDomains = domains?.length || 0;
  const activeAccounts = accounts?.length || 0;
  const totalRecords = domains?.reduce((acc: number, d: any) => acc + (d.recordsCount || 0), 0) || 0;

  return (
    <>
      <div className="flex justify-end gap-3 mb-10">
        <button className="px-4 py-2 bg-secondary rounded-xl font-medium hover:bg-secondary/80 transition-colors">
          Refresh Data
        </button>
          <Link href="/mass-cleaner" className="px-4 py-2 bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-95 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Start Cleaning
          </Link>
        </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: "Total Domains", value: totalDomains.toString(), icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10", href: "/domains" },
          { label: "Active Accounts", value: activeAccounts.toString(), icon: Users, color: "text-purple-500", bg: "bg-purple-500/10", href: "/accounts" },
          { label: "Total Records", value: totalRecords.toLocaleString(), icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10", href: "/export" },
          { label: "Health Score", value: "98%", icon: Shield, color: "text-green-500", bg: "bg-green-500/10", href: "/" },
        ].map((stat, i) => (
          <Link key={i} href={stat.href} className="glass p-6 rounded-3xl group hover:border-primary/30 transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 ${stat.bg} rounded-2xl`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <ArrowUpRight className="text-muted-foreground w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-bold mb-1">{stat.value}</div>
            <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
          </Link>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass rounded-3xl p-8 min-h-[400px] flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <Zap className="text-primary w-10 h-10" />
          </div>
          <h3 className="text-2xl font-bold mb-3">Ready for Mass Cleaning?</h3>
          <p className="text-muted-foreground max-w-md mb-8 font-medium">
            Manage millions of DNS records across Cloudflare and Spaceship with one click. Fast, secure, and mirrored in real-time.
          </p>
          <Link href="/mass-cleaner" className="px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-primary/40 hover:scale-105 transition-transform">
            Open Mass Cleaner
          </Link>
        </div>

        <div className="glass rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Recent Activities
          </h3>
          <div className="space-y-6">
            {domains?.slice(0, 4).map((domain: any) => (
              <div key={domain.id} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm truncate max-w-[120px]">{domain.domainName}</div>
                  <div className="text-[10px] font-black uppercase tracking-tighter opacity-50">{domain.provider}</div>
                </div>
                <div className="text-[10px] text-muted-foreground font-bold">
                  {domain.recordsCount} Recs
                </div>
              </div>
            ))}
            {(!domains || domains.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-10">No domains synced yet.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

