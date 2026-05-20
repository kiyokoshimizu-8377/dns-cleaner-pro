"use client";

import Sidebar from "@/components/Sidebar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { getDomains, getAccounts, syncAccount, deepSyncAccount, bulkMassDelete } from "@/lib/api";
import {
  Globe,
  Search,
  ChevronRight,
  Database,
  Cloud,
  UserCircle,
  Activity,
  RefreshCw,
  FileText,
  Download,
  AlertCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function DomainsPage() {
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["ALL"]);
  const [isTypesOpen, setIsTypesOpen] = useState(false);
  const itemsPerPage = 50;

  const { data: activeJobs = [] } = useQuery({
    queryKey: ['activeJobs'],
    queryFn: async () => {
      const res = await api.get('/domains/jobs/active');
      return res.data;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedAccount]);

  useEffect(() => {
    const savedAccount = localStorage.getItem("dns-selected-account");
    const savedSearch = localStorage.getItem("dns-search");
    if (savedAccount) setSelectedAccount(savedAccount);
    if (savedSearch) setSearch(savedSearch);
  }, []);

  useEffect(() => {
    if (selectedAccount) localStorage.setItem("dns-selected-account", selectedAccount);
  }, [selectedAccount]);

  useEffect(() => {
    if (search !== undefined) localStorage.setItem("dns-search", search);
  }, [search]);
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: (accountId: string) => syncAccount(accountId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      alert(data.message || "Sync completed successfully!");
    },
    onError: (error: any) => {
      alert("Error syncing domains: " + (error.response?.data?.message || error.message));
    }
  });

  const deepSyncMutation = useMutation({
    mutationFn: (accountId: string) => deepSyncAccount(accountId),
    onSuccess: (data) => {
      alert(data.message || "Deep sync started successfully!");
    },
    onError: (error: any) => {
      alert("Failed to start deep sync: " + (error.response?.data?.message || error.message));
    }
  });

  const { data: domains, isLoading: domainsLoading, isError } = useQuery({
    queryKey: ["domains"],
    queryFn: getDomains
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts
  });

  const exportToTXT = () => {
    const baseList = selectedAccount === "all" || !selectedAccount ? (domains || []) : (domains?.filter((d: any) => d.accountId === selectedAccount) || []);
    const domainsWithMoreThan100 = baseList.filter((d: any) => d.recordsCount > 100);

    if (domainsWithMoreThan100.length === 0) {
      alert("No domains found with more than 100 records for the selected account.");
      return;
    }

    const txtContent = domainsWithMoreThan100.map((d: any) => d.domainName).join("\r\n");
    const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "domains_more_than_100_records.txt";
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();

    // Using a tiny timeout prevents Chrome from discarding the anchor element 
    // before the download event reads its 'download' attribute.
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  };

  const exportToCSV = () => {
    const baseList = selectedAccount === "all" || !selectedAccount ? (domains || []) : (domains?.filter((d: any) => d.accountId === selectedAccount) || []);
    const domainsWithMoreThan100 = baseList.filter((d: any) => d.recordsCount > 100);

    if (domainsWithMoreThan100.length === 0) {
      alert("No domains found with more than 100 records for the selected account.");
      return;
    }

    const headers = ["Domain Name", "Provider", "Records Count", "Account Name"];
    const rows = domainsWithMoreThan100.map((d: any) => {
      const account = accounts?.find((acc: any) => acc.id === d.accountId);
      const accountName = account
        ? (account.label || account.email || account.providerName)
        : "Unknown Account";

      const escape = (val: any) => {
        const str = String(val ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escape(d.domainName),
        escape(d.provider),
        escape(d.recordsCount),
        escape(accountName)
      ].join(",");
    });

    const csvContent = ["sep=,", headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "domains_more_than_100_records.csv";
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  };

  const exportToPDF = () => {
    const baseList = selectedAccount === "all" || !selectedAccount ? (domains || []) : (domains?.filter((d: any) => d.accountId === selectedAccount) || []);
    const domainsWithMoreThan100 = baseList.filter((d: any) => d.recordsCount > 100);

    if (domainsWithMoreThan100.length === 0) {
      alert("No domains found with more than 100 records for the selected account.");
      return;
    }

    const rowsHtml = domainsWithMoreThan100.map((d: any) => {
      const account = accounts?.find((acc: any) => acc.id === d.accountId);
      const accountName = account
        ? (account.label || account.email || account.providerName)
        : "Unknown Account";
      return `
        <tr>
          <td style="text-align: left; font-weight: bold; padding: 14px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0;">${d.domainName}</td>
          <td style="text-align: center; padding: 14px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0;">
            <span style="padding: 4px 8px; background: #e2e8f0; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569;">${d.provider}</span>
          </td>
          <td style="text-align: center; font-weight: bold; color: #2563eb; padding: 14px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0;">${d.recordsCount}</td>
          <td style="text-align: left; font-weight: 600; color: #475569; padding: 14px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0;">${accountName}</td>
        </tr>
      `;
    }).join("");

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>DNS Cleaner Pro - Domains Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 40px; }
            h1 { font-weight: 900; text-align: center; color: #1e3a8a; margin-bottom: 5px; }
            p.subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 40px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f1f5f9; padding: 12px; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; color: #475569; border-bottom: 2px solid #cbd5e1; }
            tr:nth-child(even) td { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>DNS Cleaner Pro - Domain Portfolio Report</h1>
          <p class="subtitle">Generated on ${new Date().toLocaleDateString()} | Domains with > 100 records</p>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Domain Name</th>
                <th style="text-align: center;">Provider</th>
                <th style="text-align: center;">Records Count</th>
                <th style="text-align: left;">Account Name</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const filteredDomains = domains?.filter((d: any) => {
    const matchesSearch = d.domainName.toLowerCase().includes(search.toLowerCase());
    const matchesAccount = selectedAccount === "all" || d.accountId === selectedAccount;
    return matchesSearch && matchesAccount;
  }).sort((a: any, b: any) => b.recordsCount - a.recordsCount) || [];

  const showDomains = selectedAccount !== "";

  const totalPages = Math.ceil(filteredDomains.length / itemsPerPage);
  const paginatedDomains = filteredDomains.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      {/* DNS Management Top Card */}
      <div className="glass p-8 rounded-[2rem] border border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-1">DNS Management</h1>
          <p className="text-muted-foreground text-sm font-medium">Select an account to view and manage domains</p>
        </div>

        <div className="flex items-center gap-4">
          <button
            disabled={!selectedAccount || selectedAccount === "all" || deepSyncMutation.isPending}
            onClick={() => deepSyncMutation.mutate(selectedAccount)}
            className="flex items-center gap-2 px-6 py-3 bg-[#2d3b5c] text-white rounded-xl font-bold text-sm hover:bg-[#3d4b6c] transition-all shadow-lg border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${deepSyncMutation.isPending ? "animate-spin" : ""}`} />
            Deep Analyze
          </button>

          <button
            onClick={() => syncMutation.mutate(selectedAccount)}
            disabled={syncMutation.isPending || !selectedAccount || selectedAccount === "all"}
            className="flex items-center gap-2 px-6 py-3 bg-[#2d3b5c] text-white rounded-xl font-bold text-sm hover:bg-[#3d4b6c] transition-all shadow-lg border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Domains"}
          </button>

          <div className="relative min-w-[240px]">
            <select
              className="w-full bg-secondary border-none rounded-xl py-3 pl-4 pr-10 focus:ring-2 ring-primary appearance-none cursor-pointer font-bold text-sm shadow-sm text-muted-foreground"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              <option value="" disabled>-- Select Account --</option>
              <option value="all">All Accounts</option>
              {accounts?.map((acc: any) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label ? `${acc.label} (${acc.providerName})` : (acc.email || acc.providerName)}
                </option>
              ))}
            </select>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Error Message Bar (Conditional) */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3 text-red-500">
            <AlertCircle className="w-5 h-5" />
            <span className="font-bold text-sm">Error loading domains.</span>
          </div>
          <button className="px-6 py-2 bg-secondary/50 hover:bg-secondary rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            Retry
          </button>
        </div>
      )}

      {/* Search and Action Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="relative w-full md:w-[500px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <input
            type="text"
            placeholder="Search domain..."
            className="w-full bg-[#3d4b6c]/30 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 ring-primary transition-all shadow-sm text-white placeholder:text-muted-foreground/60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportToTXT}
            className="flex items-center gap-2 px-6 py-3 bg-[#2a1a1a] text-[#fca5a5] rounded-xl font-black text-xs uppercase tracking-widest border border-red-500/10 hover:bg-[#3a2a2a] transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            TXT
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-6 py-3 bg-[#143a24]/40 text-[#4ade80] rounded-xl font-black text-xs uppercase tracking-widest border border-[#4ade80]/10 hover:bg-[#143a24]/60 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-6 py-3 bg-[#3d4b6c]/40 text-[#94a3b8] rounded-xl font-black text-xs uppercase tracking-widest border border-white/5 hover:bg-[#3d4b6c]/60 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
          <div className="px-5 py-3 bg-[#2d3b5c] text-white rounded-full font-black text-xs uppercase tracking-widest shadow-lg">
            {filteredDomains.length} Domains
          </div>
        </div>
      </div>

      {/* Top Pagination Bar */}
      {totalPages > 1 && (
        <div className="glass p-3 px-6 rounded-2xl border border-white/5 bg-[#1a233d]/30 flex items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="text-xs text-muted-foreground font-medium">
            Showing <span className="font-bold text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-white">{Math.min(currentPage * itemsPerPage, filteredDomains.length)}</span> of <span className="font-bold text-white">{filteredDomains.length}</span> domains
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3.5 py-1.5 bg-[#2d3b5c] rounded-xl font-bold text-xs text-white hover:bg-[#3d4b6c] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <div className="px-3.5 py-1.5 font-bold text-xs text-white bg-white/5 rounded-xl">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3.5 py-1.5 bg-[#2d3b5c] rounded-xl font-bold text-xs text-white hover:bg-[#3d4b6c] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Inline Bulk Action Bar */}
      {selectedDomains.length > 0 && (
        <div className="glass p-3 px-5 rounded-2xl border border-white/5 bg-[#1a233d]/30 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-4">
            <span className="text-white font-black text-sm">{selectedDomains.length} domains selected</span>
            <button 
              onClick={() => setSelectedDomains([])}
              className="text-xs text-primary hover:underline font-bold transition-all"
            >
              Clear Selection
            </button>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {/* Record Type Selector */}
            <div className="relative">
              <button 
                onClick={() => setIsTypesOpen(!isTypesOpen)}
                className="px-4 py-2 bg-[#3d4b6c]/30 border border-white/5 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer hover:bg-white/10 min-w-[140px] text-left flex justify-between items-center gap-2"
              >
                <span>Types: {selectedTypes.join(', ')}</span>
                <span className="text-[10px] opacity-40">▼</span>
              </button>
              {isTypesOpen && (
                <div className="absolute top-full right-0 mt-2 bg-[#11192e] border border-white/10 rounded-2xl shadow-2xl p-4 z-50 w-64 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-3 duration-200">
                  <div 
                    onClick={() => { setSelectedTypes(["ALL"]); setIsTypesOpen(false); }}
                    className={`col-span-2 flex items-center gap-2 p-2 rounded-lg cursor-pointer ${selectedTypes.includes("ALL") ? "bg-red-500/15 text-red-400" : "bg-white/5"}`}
                  >
                    <input type="checkbox" checked={selectedTypes.includes("ALL")} onChange={() => {}} className="pointer-events-none accent-red-500" />
                    <span className="text-[10px] font-black uppercase tracking-wider">ALL RECORDS</span>
                  </div>
                  {["A", "CNAME", "TXT", "MX", "NS", "SRV"].map(type => {
                    const isSelected = selectedTypes.includes(type);
                    return (
                      <div 
                        key={type}
                        onClick={() => {
                          setSelectedTypes(prev => {
                            const filtered = prev.filter(t => t !== "ALL");
                            if (filtered.includes(type)) {
                              const res = filtered.filter(t => t !== type);
                              return res.length === 0 ? ["ALL"] : res;
                            } else {
                              return [...filtered, type];
                            }
                          });
                        }}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${isSelected ? "bg-primary/15 text-primary" : "bg-white/5"}`}
                      >
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="pointer-events-none accent-primary" />
                        <span className="text-xs font-bold">{type}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clean Button */}
            <button 
              onClick={async () => {
                if (!confirm(`Are you sure you want to clean selected records from ${selectedDomains.length} domains?`)) return;
                try {
                  const res = await bulkMassDelete(selectedDomains, selectedTypes);
                  localStorage.setItem("dns-mass-cleaner-jobIds", JSON.stringify(res.jobIds));
                  localStorage.setItem("dns-mass-cleaner-input", selectedDomains.join("\n"));
                  localStorage.setItem("dns-mass-cleaner-types", JSON.stringify(selectedTypes));
                  window.location.href = "/mass-cleaner";
                } catch (e: any) {
                  alert("Failed to start clean: " + e.message);
                }
              }}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer shadow-lg shadow-red-900/20"
            >
              Clean Records
            </button>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="glass rounded-[2rem] border border-white/5 min-h-[500px] flex flex-col overflow-hidden">
        {domainsLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
            <RefreshCw className="w-12 h-12 text-primary animate-spin opacity-20" />
            <p className="text-muted-foreground font-bold animate-pulse">Loading domains...</p>
          </div>
        ) : !showDomains ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-20 gap-6">
            <div className="w-24 h-24 bg-secondary/30 rounded-full flex items-center justify-center opacity-20">
              <Globe className="w-12 h-12" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white/90 mb-2">No account selected</h3>
              <p className="text-muted-foreground font-medium max-w-sm mx-auto">Please select an account from the dropdown above to view your domain portfolio.</p>
            </div>
          </div>
        ) : filteredDomains.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-20 gap-6">
            <div className="w-24 h-24 bg-secondary/30 rounded-full flex items-center justify-center opacity-20 animate-pulse">
              <Globe className="w-12 h-12" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white/90 mb-2">No domains found</h3>
              <p className="text-muted-foreground font-medium max-w-sm mx-auto">We couldn&apos;t find any domains matching your search or selection.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left table-fixed">
              <thead className="bg-secondary/40 border-b border-white/5">
                <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-5 w-[6%] text-center">
                    <input 
                      type="checkbox"
                      className="accent-primary w-4 h-4 cursor-pointer rounded border-white/10 bg-white/5"
                      checked={paginatedDomains.length > 0 && paginatedDomains.every((d: any) => selectedDomains.includes(d.domainName))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDomains(prev => {
                            const newSelections = paginatedDomains.map((d: any) => d.domainName);
                            return Array.from(new Set([...prev, ...newSelections]));
                          });
                        } else {
                          const paginatedNames = paginatedDomains.map((d: any) => d.domainName);
                          setSelectedDomains(prev => prev.filter(name => !paginatedNames.includes(name)));
                        }
                      }}
                    />
                  </th>
                  <th className="px-8 py-5 w-[34%]">Domain Name</th>
                  <th className="px-8 py-5 text-center w-[15%]">Provider</th>
                  <th className="px-8 py-5 text-center w-[15%]">Records</th>
                  <th className="px-8 py-5 w-[15%]">Last Sync</th>
                  <th className="px-8 py-5 text-right w-[15%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedDomains.map((domain: any) => (
                  <tr key={domain.id} className="hover:bg-primary/5 transition-colors group">
                    <td className="px-6 py-6 text-center">
                      <input 
                        type="checkbox"
                        className="accent-primary w-4 h-4 cursor-pointer rounded border-white/10 bg-white/5"
                        checked={selectedDomains.includes(domain.domainName)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDomains(prev => [...prev, domain.domainName]);
                          } else {
                            setSelectedDomains(prev => prev.filter(name => name !== domain.domainName));
                          }
                        }}
                      />
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                          <Globe className="text-primary w-5 h-5" />
                        </div>
                        <span className="font-bold text-lg truncate text-white" title={domain.domainName}>{domain.domainName}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="px-3 py-1 bg-secondary rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground inline-block">
                        {domain.provider}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex items-center justify-center gap-2 font-bold text-white">
                        <Database className="w-4 h-4 text-primary/60" />
                        {domain.recordsCount}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                        <Activity className="w-4 h-4" />
                        {new Date(domain.lastSync).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <Link
                        href={`/domains/${domain.id}`}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary rounded-xl font-bold hover:bg-primary hover:text-white transition-all group-hover:shadow-lg group-hover:shadow-primary/20"
                      >
                        Manage <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-8 py-6 border-t border-white/5 bg-secondary/20">
                <div className="text-sm text-muted-foreground font-medium">
                  Showing <span className="font-bold text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-white">{Math.min(currentPage * itemsPerPage, filteredDomains.length)}</span> of <span className="font-bold text-white">{filteredDomains.length}</span> domains
                </div>
                <div className={`flex items-center gap-2 transition-all duration-300 ${activeJobs.length > 0 ? "md:mr-[350px]" : ""}`}>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-[#2d3b5c] rounded-xl font-bold text-sm text-white hover:bg-[#3d4b6c] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <div className="px-4 py-2 font-bold text-sm text-white bg-white/5 rounded-xl">
                    Page {currentPage} of {totalPages}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-[#2d3b5c] rounded-xl font-bold text-sm text-white hover:bg-[#3d4b6c] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
