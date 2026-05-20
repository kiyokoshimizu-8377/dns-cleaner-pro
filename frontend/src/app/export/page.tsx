"use client";

import Sidebar from "@/components/Sidebar";
import { useQuery } from "@tanstack/react-query";
import { getDomains } from "@/lib/api";
import { 
  Download, 
  FileJson, 
  FileText, 
  Filter, 
  AlertCircle,
  Table as TableIcon
} from "lucide-react";
import { useState } from "react";

export default function ExportPage() {
  const [minRecords, setMinRecords] = useState(100);
  
  const { data: domains, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: getDomains
  });

  const filteredDomains = domains?.filter((d: any) => d.recordsCount >= minRecords) || [];

  const exportToCSV = () => {
    const headers = ["Domain Name", "Provider", "Record Count", "Last Sync"];
    const rows = filteredDomains.map((d: any) => [
      d.domainName,
      d.provider,
      d.recordsCount,
      new Date(d.lastSync).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `dns_export_${minRecords}_plus.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToTXT = () => {
    const txtContent = filteredDomains.map((d: any) => d.domainName).join("\n");
    const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `domains_list.txt`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass p-6 rounded-3xl border-white/5">
            <h3 className="font-bold mb-6 flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              Filters
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Min Record Count</label>
                <input 
                  type="number" 
                  className="w-full bg-secondary border-none rounded-xl p-3 focus:ring-2 ring-primary font-bold"
                  value={minRecords}
                  onChange={(e) => setMinRecords(parseInt(e.target.value) || 0)}
                />
                <p className="mt-2 text-[10px] text-muted-foreground">Show domains with at least this many records.</p>
              </div>
            </div>
          </div>

          <div className="glass p-6 rounded-3xl border-primary/20 bg-primary/5">
             <h3 className="font-bold mb-4">Export Options</h3>
             <div className="space-y-3">
                <button 
                  onClick={exportToCSV}
                  disabled={filteredDomains.length === 0}
                  className="w-full flex items-center justify-between p-4 bg-secondary/50 rounded-2xl hover:bg-primary hover:text-white transition-all group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                     <FileText className="w-5 h-5 opacity-70 group-hover:opacity-100" />
                     <span className="font-bold text-sm">Download CSV</span>
                  </div>
                  <Download className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                <button 
                  onClick={exportToTXT}
                  disabled={filteredDomains.length === 0}
                  className="w-full flex items-center justify-between p-4 bg-secondary/50 rounded-2xl hover:bg-primary hover:text-white transition-all group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                     <FileJson className="w-5 h-5 opacity-70 group-hover:opacity-100" />
                     <span className="font-bold text-sm">Plain List (TXT)</span>
                  </div>
                  <Download className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
             </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="lg:col-span-3">
          <div className="glass rounded-3xl overflow-hidden border-white/5">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-secondary/20">
              <h3 className="font-bold flex items-center gap-2">
                <TableIcon className="w-5 h-5 text-primary" />
                Results Preview ({filteredDomains.length})
              </h3>
            </div>
            
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-secondary/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="px-8 py-4">Domain Name</th>
                    <th className="px-8 py-4">Provider</th>
                    <th className="px-8 py-4 text-center">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading ? (
                    [1, 2, 3, 4, 5].map(i => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={3} className="px-8 py-6 bg-white/5 h-16"></td>
                      </tr>
                    ))
                  ) : filteredDomains.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-muted-foreground font-medium">
                         No domains match your current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredDomains.map((domain: any) => (
                      <tr key={domain.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-4 font-bold">{domain.domainName}</td>
                        <td className="px-8 py-4">
                           <span className="px-2 py-1 bg-secondary rounded text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                             {domain.provider}
                           </span>
                        </td>
                        <td className="px-8 py-4 text-center font-bold text-primary">{domain.recordsCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
