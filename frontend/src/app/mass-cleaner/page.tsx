"use client";

import Sidebar from "@/components/Sidebar";
import { useState, useEffect } from "react";
import { 
  Trash2, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Database,
  Search,
  Zap,
  ArrowRight,
  XCircle,
  Ban
} from "lucide-react";
import { bulkMassDelete, getJobStatus, cancelBatch } from "@/lib/api";

export default function MassCleanerPage() {
  const [domainInput, setDomainInput] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["A", "CNAME", "TXT"]);
  const [isOpen, setIsOpen] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ [key: string]: any }>({});

  useEffect(() => {
    const savedInput = localStorage.getItem("dns-mass-cleaner-input");
    const savedTypes = localStorage.getItem("dns-mass-cleaner-types");
    const savedJobIds = localStorage.getItem("dns-mass-cleaner-jobIds");
    const savedBatchId = localStorage.getItem("dns-mass-cleaner-batchId");
    
    if (savedInput) setDomainInput(savedInput);
    if (savedTypes) {
      try {
        setSelectedTypes(JSON.parse(savedTypes));
      } catch (e) {}
    }
    if (savedJobIds) {
      try {
        const parsedIds = JSON.parse(savedJobIds);
        if (parsedIds && parsedIds.length > 0) {
          setJobIds(parsedIds);
          setIsProcessing(true);
        }
      } catch (e) {}
    }
    if (savedBatchId) setCurrentBatchId(savedBatchId);
  }, []);

  useEffect(() => {
    if (domainInput !== undefined) localStorage.setItem("dns-mass-cleaner-input", domainInput);
  }, [domainInput]);

  useEffect(() => {
    if (selectedTypes) localStorage.setItem("dns-mass-cleaner-types", JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    if (jobIds && jobIds.length > 0) {
      localStorage.setItem("dns-mass-cleaner-jobIds", JSON.stringify(jobIds));
      if (currentBatchId) localStorage.setItem("dns-mass-cleaner-batchId", currentBatchId);
    } else {
      localStorage.removeItem("dns-mass-cleaner-jobIds");
      localStorage.removeItem("dns-mass-cleaner-batchId");
    }
  }, [jobIds, currentBatchId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".custom-multi-select")) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const recordTypes = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"];

  const toggleType = (type: string) => {
    if (type === "ALL") {
      setSelectedTypes(["ALL"]);
      return;
    }
    
    setSelectedTypes(prev => {
      const filtered = prev.filter(t => t !== "ALL");
      if (filtered.includes(type)) {
        const result = filtered.filter(t => t !== type);
        return result.length === 0 ? ["ALL"] : result;
      } else {
        return [...filtered, type];
      }
    });
  };

  const handleStartCleaning = async () => {
    const domains = domainInput
      .split("\n")
      .map(d => d.trim())
      .filter(d => d !== "");
    
    if (domains.length === 0) {
      alert("Please enter at least one domain.");
      return;
    }

    if (!confirm(`Are you sure you want to clean ${domains.length} domains? This action is irreversible.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const result = await bulkMassDelete(domains, selectedTypes);
      setJobIds(result.jobIds);
      setCurrentBatchId(result.batchId);
      // Initialize progress
      const initialProgress: any = {};
      result.jobIds.forEach((id: string) => {
        initialProgress[id] = { status: "queued", progress: 0 };
      });
      setProgress(initialProgress);
    } catch (error: any) {
      alert("Failed to start cleaning: " + error.message);
      setIsProcessing(false);
    }
  };

  // Poll for job status
  useEffect(() => {
    if (jobIds.length === 0) return;

    const interval = setInterval(async () => {
      const newProgress = { ...progress };
      let allDone = true;

      for (const id of jobIds) {
        if (newProgress[id]?.status === "completed" || newProgress[id]?.status === "failed") continue;
        
        try {
          const status = await getJobStatus(id);
          newProgress[id] = {
            status: status.status,
            progress: status.progress,
            result: status.result
          };
          if (status.status !== "completed" && status.status !== "failed" && status.status !== "cancelled") {
            allDone = false;
          }
        } catch (e) {
          newProgress[id] = { status: "failed", progress: 0 };
        }
      }

      setProgress(newProgress);
      if (allDone) {
        setIsProcessing(false);
        setJobIds([]);
        setCurrentBatchId(null);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobIds, progress, isCancelling]);

  const handleCancel = async () => {
    if (!currentBatchId) return;
    setIsCancelling(true);
    setShowCancelModal(false);
    try {
      await cancelBatch(currentBatchId);
      // Update UI state immediately
      const newProgress = { ...progress };
      for (const id in newProgress) {
        if (newProgress[id].status === "queued" || newProgress[id].status === "active" || newProgress[id].status === "waiting") {
          newProgress[id].status = "cancelled";
        }
      }
      setProgress(newProgress);
      setIsProcessing(false);
      setJobIds([]);
      setCurrentBatchId(null);
      alert("Mass cleaner cancelled successfully.");
    } catch (e: any) {
      alert("Failed to cancel: " + e.message);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-white tracking-tight">Deletion by Record Type</h1>
        <p className="text-muted-foreground text-sm font-medium leading-relaxed max-w-4xl">
          Manually delete records from multiple domains at once. Large lists run in batches; <span className="text-primary font-bold">0 / total</span> only means no batch has finished yet — the server is still talking to Cloudflare. Your list and results stay if you open another page and come back (same browser tab).
        </p>
      </div>

      <div className="glass p-8 rounded-[2.5rem] border border-white/5 space-y-8 relative overflow-hidden">
        {/* Subtle Background Icon */}
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
          <Trash2 className="w-64 h-64" />
        </div>

        {/* Input Sections */}
        <div className="space-y-6 relative z-10">
          <div className="space-y-3">
            <label className="block text-sm font-black text-white/80 ml-1 uppercase tracking-wider">Domains to delete (one per line)</label>
            <textarea 
              className="w-full h-64 bg-[#3d4b6c]/20 border border-white/5 rounded-2xl p-6 focus:ring-2 ring-primary transition-all font-mono text-sm resize-none text-white placeholder:text-muted-foreground/40"
              placeholder="youtube.com&#10;google.com&#10;example.fr"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-3 relative custom-multi-select">
            <label className="block text-sm font-black text-white/80 ml-1 uppercase tracking-wider">Record types to delete</label>
            <div className="relative">
              <div 
                onClick={() => !isProcessing && setIsOpen(!isOpen)}
                className={`w-full bg-[#3d4b6c]/20 border border-white/5 rounded-2xl py-4 px-6 min-h-[56px] focus:ring-2 ring-primary cursor-pointer flex items-center justify-between gap-4 transition-all hover:bg-[#3d4b6c]/35 ${isOpen ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex flex-wrap gap-2 items-center">
                  {selectedTypes.includes("ALL") ? (
                    <span className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-black uppercase tracking-wider shadow-[0_0_8px_rgba(239,68,68,0.2)] animate-pulse">
                      All Records (ALL)
                    </span>
                  ) : (
                    selectedTypes.map(type => (
                      <span key={type} className="px-3 py-1 bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-bold shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                        {type}
                      </span>
                    ))
                  )}
                </div>
                <div className="shrink-0 opacity-50">
                  <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${isOpen ? "-rotate-90" : "rotate-90"}`} />
                </div>
              </div>

              {/* Floating Dropdown Menu */}
              {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-[#11192e] border border-white/10 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/5 flex-wrap">
                    <button
                      onClick={() => { setSelectedTypes(["ALL"]); setIsOpen(false); }}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/25 border border-red-500/10 text-red-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => { setSelectedTypes(["A", "CNAME", "TXT"]); }}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/25 border border-primary/10 text-primary rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Web Common (A, CNAME, TXT)
                    </button>
                    <button
                      onClick={() => { setSelectedTypes(["MX"]); }}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/10 text-amber-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Mail Only (MX)
                    </button>
                  </div>

                  {/* Types List Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* ALL option */}
                    <div 
                      onClick={() => toggleType("ALL")}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer select-none transition-all ${selectedTypes.includes("ALL") ? "bg-red-500/15 border border-red-500/20 text-red-400" : "bg-white/5 hover:bg-white/10 text-muted-foreground border border-transparent"}`}
                    >
                      <input 
                        type="checkbox" 
                        checked={selectedTypes.includes("ALL")}
                        onChange={() => {}}
                        className="accent-red-500 pointer-events-none"
                      />
                      <span className="text-xs font-black tracking-wider">ALL RECORDS</span>
                    </div>

                    {/* Individual options */}
                    {recordTypes.map(type => {
                      const isSelected = selectedTypes.includes(type);
                      return (
                        <div 
                          key={type}
                          onClick={() => toggleType(type)}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer select-none transition-all ${isSelected ? "bg-primary/15 border border-primary/20 text-primary" : "bg-white/5 hover:bg-white/10 text-muted-foreground border border-transparent"}`}
                        >
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => {}}
                            className="accent-primary pointer-events-none"
                          />
                          <span className="text-xs font-bold">{type} Records</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Warning Box */}
          <div className="bg-[#1a0a0a] border border-red-500/20 p-6 rounded-2xl flex gap-5">
            <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h4 className="font-black text-red-500 mb-1">Warning - Destructive action</h4>
              <p className="text-red-500/70 text-sm font-medium leading-relaxed">
                This action will delete <span className="font-black text-red-500 underline">all DNS records</span> for the domains listed above. This operation is irreversible.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button 
            disabled={isProcessing || domainInput.trim() === ""}
            onClick={handleStartCleaning}
            className="w-full py-5 bg-[#b91c1c] text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-red-900/40 hover:bg-[#991b1b] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Processing Batch...
              </>
            ) : (
              <>
                <Trash2 className="w-6 h-6" />
                Delete ALL records
              </>
            )}
          </button>
        </div>

        {/* Progress Section (Appears below when active) */}
        {(isProcessing || Object.keys(progress).length > 0) && (
          <div className="pt-8 mt-8 border-t border-white/5 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Cleaning Progress
              </h3>
              <div className="flex items-center gap-4">
                <div className="px-4 py-1.5 bg-primary/20 text-primary rounded-full text-[10px] font-black uppercase tracking-widest">
                  {Object.values(progress).filter(p => p.status === "completed").length} / {Object.keys(progress).length} Jobs Done
                </div>
                {isProcessing && (
                  <button 
                    onClick={() => setShowCancelModal(true)}
                    disabled={isCancelling}
                    className="flex items-center gap-2 px-4 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full text-xs font-black uppercase tracking-widest transition-all"
                  >
                    {isCancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                    Stop
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(progress).map(([id, data]) => (
                <div key={id} className="bg-white/5 p-4 rounded-xl flex items-center gap-4 group hover:bg-white/10 transition-all">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Job ID: {id.slice(0, 8)}</span>
                      <span className="text-xs font-black text-primary">{data.progress}%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                        style={{ width: `${data.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0">
                    {data.status === "completed" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : data.status === "failed" ? (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    ) : data.status === "cancelled" ? (
                      <XCircle className="w-5 h-5 text-amber-500" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#11192e] border border-red-500/20 rounded-3xl p-8 max-w-md w-full shadow-2xl shadow-red-900/20">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-white text-center mb-2">Stop Mass Cleaner?</h2>
            <p className="text-muted-foreground text-center text-sm leading-relaxed mb-8">
              Are you sure? Domains that are currently mid-cleanup may end up <span className="text-red-400 font-bold">partially cleaned</span>. This will safely stop active workers and drain the queue.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all"
              >
                Go Back
              </button>
              <button 
                onClick={handleCancel}
                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)]"
              >
                Yes, Stop Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
