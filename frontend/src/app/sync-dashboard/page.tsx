"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  getSyncBatches,
  getSyncBatchDetails,
  getTaskSteps,
  cancelSyncBatch,
} from "@/lib/api";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  Clock,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  Database,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface Batch {
  id: string;
  type: string;
  status: string;
  health: "HEALTHY" | "DEGRADED" | "STALLED" | "PARTIAL_FAILURE" | "COMPLETED" | "CANCELLED" | "FAILED";
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelReason: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface Task {
  id: string;
  targetId: string | null;
  targetName: string;
  status: string;
  currentStep: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Step {
  id: string;
  name: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  attempt?: number;
  maxRetries?: number;
  retryAt?: string;
}

export default function SyncDashboardPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Batch | null>(null);
  
  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Lazy-loaded task steps
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskSteps, setTaskSteps] = useState<Record<string, Step[]>>({});
  const [loadingSteps, setLoadingSteps] = useState<Record<string, boolean>>({});

  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);

  // SSE vs Polling connection status
  const [connectionType, setConnectionType] = useState<"SSE" | "Polling" | "None">("None");

  const sseRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load list of batches on mount
  useEffect(() => {
    fetchBatches();
    const interval = setInterval(fetchBatches, 15000); // refresh list every 15s
    return () => clearInterval(interval);
  }, []);

  const fetchBatches = async () => {
    try {
      const data = await getSyncBatches();
      setBatches(data);
      if (data.length > 0 && !selectedBatchId) {
        setSelectedBatchId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch batches", err);
    } finally {
      setLoadingBatches(false);
    }
  };

  // Fetch details and manage SSE/Polling subscription when selected batch changes
  useEffect(() => {
    if (!selectedBatchId) return;

    fetchBatchDetails(selectedBatchId, page, statusFilter, searchQuery);
    setupRealtimeUpdates(selectedBatchId);

    return () => {
      cleanupRealtime();
    };
  }, [selectedBatchId, page, statusFilter, searchQuery]);

  const fetchBatchDetails = async (
    batchId: string, 
    pageNum: number, 
    status: string, 
    search: string
  ) => {
    setLoadingDetails(true);
    try {
      const data = await getSyncBatchDetails(batchId, {
        page: pageNum,
        limit: 10,
        status: status || undefined,
        search: search || undefined,
      });
      setBatchDetails(data.batch);
      setTasks(data.tasks);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error("Failed to fetch batch details", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Gracefully clear SSE & polling resources
  const cleanupRealtime = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setConnectionType("None");
  };

  // Establish SSE connection, fallback to polling if SSE fails
  const setupRealtimeUpdates = (batchId: string) => {
    cleanupRealtime();

    const targetBatch = batches.find(b => b.id === batchId) || batchDetails;
    const isFinished = targetBatch && ["COMPLETED", "FAILED", "CANCELLED"].includes(targetBatch.status);

    if (isFinished) {
      setConnectionType("None");
      return; // No need for live streams on inactive batches
    }

    // Try SSE
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const es = new EventSource(`${apiBase}/sync/batches/${batchId}/sse`);
      sseRef.current = es;
      setConnectionType("SSE");

      es.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        handleRealtimeEvent(payload);
      };

      es.onerror = () => {
        console.warn("SSE connection error. Falling back to HTTP polling...");
        es.close();
        sseRef.current = null;
        startPolling(batchId);
      };
    } catch (err) {
      console.warn("Failed to initialize SSE. Falling back to HTTP polling...", err);
      startPolling(batchId);
    }
  };

  // Start polling as fallback
  const startPolling = (batchId: string) => {
    cleanupRealtime();
    setConnectionType("Polling");
    pollingIntervalRef.current = setInterval(() => {
      fetchBatchDetails(batchId, page, statusFilter, searchQuery);
      // If expanding a task, refresh steps as well
      if (expandedTaskId) {
        lazyLoadSteps(expandedTaskId, true);
      }
    }, 4000);
  };

  // Process a real-time event from SSE
  const handleRealtimeEvent = (payload: any) => {
    if (payload.type === "batch_updated") {
      setBatchDetails(prev => prev ? { ...prev, ...payload.data } : null);
      // Refresh batch list to reflect stats globally
      fetchBatches();
    } else if (payload.type === "task_updated") {
      setTasks(prevTasks =>
        prevTasks.map(t =>
          t.id === payload.taskId ? { ...t, ...payload.data } : t
        )
      );
    } else if (payload.type === "step_updated") {
      // Refresh steps if this task is currently expanded
      if (expandedTaskId === payload.taskId) {
        lazyLoadSteps(payload.taskId, true);
      }
    }
  };

  // Lazy load task steps JIT
  const lazyLoadSteps = async (taskId: string, silent = false) => {
    if (!silent) {
      setLoadingSteps(prev => ({ ...prev, [taskId]: true }));
    }
    try {
      const data = await getTaskSteps(taskId);
      setTaskSteps(prev => ({ ...prev, [taskId]: data.steps }));
    } catch (err) {
      console.error(`Failed to load steps for task ${taskId}`, err);
    } finally {
      if (!silent) {
        setLoadingSteps(prev => ({ ...prev, [taskId]: false }));
      }
    }
  };

  const handleToggleTask = (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
    } else {
      setExpandedTaskId(taskId);
      lazyLoadSteps(taskId);
    }
  };

  const handleCancelBatch = async (batchId: string) => {
    if (!confirm("Are you sure you want to cancel this batch? Active jobs will halt gracefully.")) {
      return;
    }
    setCancellingBatchId(batchId);
    try {
      await cancelSyncBatch(batchId);
      fetchBatches();
      if (selectedBatchId === batchId) {
        fetchBatchDetails(batchId, page, statusFilter, searchQuery);
      }
    } catch (err: any) {
      alert(`Failed to cancel batch: ${err.response?.data?.message || err.message}`);
    } finally {
      setCancellingBatchId(null);
    }
  };

  // Helpers for formatting
  const getHealthBadge = (health: string) => {
    switch (health) {
      case "HEALTHY":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Healthy
          </span>
        );
      case "DEGRADED":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            Degraded (Retrying)
          </span>
        );
      case "STALLED":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-600/20 text-rose-400 border border-rose-500/30 animate-bounce">
            <AlertTriangle className="w-3.5 h-3.5" />
            Stalled (Heartbeat Lost)
          </span>
        );
      case "PARTIAL_FAILURE":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Partial Failure
          </span>
        );
      case "COMPLETED":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/5 text-gray-400 border border-white/10">
            <Square className="w-3 h-3" />
            Cancelled
          </span>
        );
      case "FAILED":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/5 text-muted-foreground border border-white/10">
            {health}
          </span>
        );
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
      case "FAILED":
        return <XCircle className="w-5 h-5 text-rose-400 shrink-0" />;
      case "CANCELLED":
        return <Square className="w-4 h-4 text-gray-500 shrink-0" />;
      case "RUNNING":
        return <Activity className="w-5 h-5 text-indigo-400 animate-pulse shrink-0" />;
      default:
        return <Clock className="w-5 h-5 text-amber-400 shrink-0" />;
    }
  };

  // Timer component to handle client-side countdowns dynamically
  const RetryCountdown = ({ retryAt, attempt, maxRetries }: { retryAt: string, attempt: number, maxRetries: number }) => {
    const [timeLeft, setTimeLeft] = useState<number>(0);

    useEffect(() => {
      const calculateTimeLeft = () => {
        const diff = new Date(retryAt).getTime() - Date.now();
        setTimeLeft(Math.max(0, Math.ceil(diff / 1000)));
      };

      calculateTimeLeft();
      const interval = setInterval(calculateTimeLeft, 1000);
      return () => clearInterval(interval);
    }, [retryAt]);

    return (
      <div className="flex flex-col gap-1 text-xs text-amber-400 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 mt-2">
        <div className="flex items-center gap-2 font-semibold">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Retrying attempt {attempt}/{maxRetries + 1}...</span>
        </div>
        <div>
          Next attempt in <span className="font-bold underline">{timeLeft}s</span> at {new Date(retryAt).toLocaleTimeString()}
        </div>
      </div>
    );
  };

  // Renders a duration cleanly
  const renderDuration = (start: string | null, end: string | null) => {
    if (!start) return null;
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMs = endTime - startTime;

    if (diffMs < 0) return null;
    if (diffMs < 1000) return `${diffMs}ms`;
    return `${(diffMs / 1000).toFixed(1)}s`;
  };

  return (
    <div className="min-h-screen p-6 text-foreground">
      {/* Background gradients for premium glassmorphic looks */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-rose-500/5 blur-[100px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Orchestration & Diagnostics</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Sync & Operations Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Observe real-time provider domain records fetch state-sync and bulk operation teardowns.
          </p>
        </div>

        {connectionType !== "None" && (
          <div className="flex items-center gap-2 self-start md:self-auto bg-black/20 px-3 py-1.5 rounded-full border border-white/5 text-xs">
            <span className={`w-2 h-2 rounded-full ${connectionType === "SSE" ? "bg-indigo-400 animate-pulse" : "bg-amber-400 animate-bounce"}`} />
            <span className="font-medium">
              Live updates via <span className="font-extrabold">{connectionType}</span>
            </span>
          </div>
        )}
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Side - Batches History List */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          <div className="glass rounded-[2rem] p-6 flex flex-col gap-4 h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Workflow Batches
              </h2>
              <button 
                onClick={fetchBatches} 
                disabled={loadingBatches}
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-4 h-4 ${loadingBatches ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingBatches ? (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Loading batches...</span>
              </div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground text-sm">
                No batches found.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {batches.map((b) => {
                  const isSelected = selectedBatchId === b.id;
                  const total = b.totalJobs;
                  const completed = b.completedJobs;
                  const failed = b.failedJobs;
                  const pct = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSelectedBatchId(b.id);
                        setPage(1);
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all duration-300 ${
                        isSelected
                          ? "bg-secondary border-primary/30 shadow-lg shadow-indigo-500/5"
                          : "bg-white/5 border-white/5 hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-muted-foreground">
                          {b.type === "DEEP_SYNC" ? "Deep Sync" : "Mass Delete"}
                        </span>
                        {getHealthBadge(b.health)}
                      </div>
                      
                      <div className="font-mono text-[10px] text-muted-foreground mb-3 truncate">
                        ID: {b.id}
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full transition-all duration-500 ${
                            b.health === "STALLED" || b.status === "FAILED"
                              ? "bg-rose-500"
                              : b.health === "DEGRADED"
                              ? "bg-amber-500"
                              : "bg-primary"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{pct}% complete</span>
                        <span>{completed}/{total} tasks</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Side - Selected Batch Detail View */}
        <main className="lg:col-span-8 flex flex-col gap-6">
          {selectedBatchId && batchDetails ? (
            <>
              {/* Batch Metadata Card */}
              <div className="glass rounded-[2rem] p-6 border-none relative overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <h2 className="text-xl font-bold">
                        {batchDetails.type === "DEEP_SYNC" ? "Deep Sync Batch Details" : "Mass Delete Batch Details"}
                      </h2>
                      {getHealthBadge(batchDetails.health)}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate max-w-md md:max-w-xl">
                      Batch ID: {batchDetails.id}
                    </p>
                  </div>

                  {["PENDING", "RUNNING"].includes(batchDetails.status) && (
                    <button
                      onClick={() => handleCancelBatch(batchDetails.id)}
                      disabled={cancellingBatchId === batchDetails.id}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl border border-rose-500/20 hover:border-transparent transition-all font-bold text-xs"
                    >
                      <Square className="w-3.5 h-3.5" />
                      {cancellingBatchId === batchDetails.id ? "Cancelling..." : "Cancel Batch"}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 text-center">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="block text-xs font-semibold text-muted-foreground mb-1">Status</span>
                    <span className="text-sm font-bold tracking-wide">{batchDetails.status}</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="block text-xs font-semibold text-muted-foreground mb-1">Total Tasks</span>
                    <span className="text-lg font-extrabold">{batchDetails.totalJobs}</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="block text-xs font-semibold text-emerald-400 mb-1">Completed</span>
                    <span className="text-lg font-extrabold text-emerald-400">{batchDetails.completedJobs}</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="block text-xs font-semibold text-rose-400 mb-1">Failed</span>
                    <span className="text-lg font-extrabold text-rose-400">{batchDetails.failedJobs}</span>
                  </div>
                </div>

                {batchDetails.cancelReason && (
                  <div className="mt-6 flex items-start gap-2.5 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-400">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-extrabold">Batch cancelled: </span>
                      {batchDetails.cancelReason}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Started: {new Date(batchDetails.startedAt).toLocaleString()}
                  </span>
                  {batchDetails.completedAt && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Finished: {new Date(batchDetails.completedAt).toLocaleString()}
                    </span>
                  )}
                  {batchDetails.startedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Duration: {renderDuration(batchDetails.startedAt, batchDetails.completedAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Tasks List Container */}
              <div className="glass rounded-[2rem] p-6 border-none">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-white/5 pb-6 mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    Tasks check-in
                  </h3>

                  {/* Filters and search */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 sm:w-60">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search domains..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setPage(1);
                        }}
                        className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/5 hover:border-white/10 focus:border-primary focus:bg-white/10 rounded-xl outline-none text-xs transition-all"
                      />
                    </div>

                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                      className="bg-secondary/50 border border-white/5 rounded-xl px-3 py-2 text-xs outline-none focus:border-primary transition-all cursor-pointer"
                    >
                      <option value="">All Statuses</option>
                      <option value="PENDING">Pending</option>
                      <option value="RUNNING">Running</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="FAILED">Failed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                </div>

                {loadingDetails ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <RefreshCw className="w-6 h-6 animate-spin text-primary mr-2" />
                    <span>Loading tasks list...</span>
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-16 text-sm text-muted-foreground bg-white/5 rounded-2xl border border-dashed border-white/15">
                    No matching tasks found for this batch.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {tasks.map((task) => {
                      const isExpanded = expandedTaskId === task.id;
                      const steps = taskSteps[task.id] || [];
                      const isStepsLoading = loadingSteps[task.id];

                      return (
                        <div
                          key={task.id}
                          className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                            isExpanded
                              ? "bg-secondary/40 border-primary/20"
                              : "bg-white/5 border-white/5 hover:border-white/15"
                          }`}
                        >
                          {/* Task Row Header */}
                          <div
                            onClick={() => handleToggleTask(task.id)}
                            className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {getStatusIcon(task.status)}
                              <div className="min-w-0">
                                <span className="font-bold text-sm block truncate">
                                  {task.targetName}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground block truncate">
                                  Task ID: {task.id}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {task.currentStep && (
                                <span className="hidden sm:inline px-2 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md text-[10px] font-semibold">
                                  Step: {task.currentStep}
                                </span>
                              )}
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {/* Task Content - Lazy Loaded Steps Details */}
                          {isExpanded && (
                            <div className="border-t border-white/5 p-5 bg-black/10">
                              {isStepsLoading ? (
                                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                  <span>Lazy loading execution timeline...</span>
                                </div>
                              ) : steps.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-2">
                                  No steps registered for this task yet.
                                </div>
                              ) : (
                                <div className="flex flex-col gap-4">
                                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                                    Step Execution Timeline
                                  </h4>
                                  
                                  {/* Step Timeline Track */}
                                  <div className="relative pl-6 space-y-5 border-l border-white/10 ml-3 py-1">
                                    {steps.map((step) => {
                                      const isStepActive = step.status === "RUNNING";
                                      const isRetrying = step.status === "RETRYING" && step.retryAt;

                                      return (
                                        <div key={step.id} className="relative group">
                                          {/* Bullet node on timeline */}
                                          <div className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                                            step.status === "COMPLETED"
                                              ? "bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                              : step.status === "FAILED"
                                              ? "bg-rose-500 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]"
                                              : isStepActive || isRetrying
                                              ? "bg-indigo-400 border-indigo-400 animate-pulse"
                                              : "bg-background border-white/30"
                                          }`} />

                                          <div className="flex items-center justify-between gap-4">
                                            <div>
                                              <span className="text-xs font-bold block">
                                                {step.name}
                                              </span>
                                              <span className="text-[10px] text-muted-foreground block">
                                                Status: <span className="font-extrabold uppercase">{step.status}</span>
                                              </span>
                                            </div>
                                            
                                            <div className="text-[10px] font-mono text-muted-foreground shrink-0">
                                              {renderDuration(step.startedAt, step.completedAt)}
                                            </div>
                                          </div>

                                          {/* Handle retry countdowns */}
                                          {isRetrying && step.retryAt && (
                                            <RetryCountdown 
                                              retryAt={step.retryAt} 
                                              attempt={step.attempt || 1} 
                                              maxRetries={step.maxRetries || 3} 
                                            />
                                          )}

                                          {/* Collapsible Error Traces */}
                                          {step.error && (
                                            <details className="mt-2 text-xs border border-rose-500/20 bg-rose-500/5 p-3 rounded-xl transition-all cursor-pointer">
                                              <summary className="font-semibold text-rose-400 select-none outline-none">
                                                Error: {step.error.substring(0, 80)}{step.error.length > 80 ? "..." : ""}
                                              </summary>
                                              <div className="mt-2 text-[10px] font-mono text-rose-300 leading-relaxed whitespace-pre-wrap select-all cursor-text bg-black/30 p-2 rounded border border-white/5 max-h-40 overflow-y-auto">
                                                {step.error}
                                              </div>
                                            </details>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Task general error trace */}
                              {task.error && !isStepsLoading && (
                                <div className="mt-4 p-4 bg-rose-500/5 border border-rose-500/25 rounded-2xl text-xs">
                                  <div className="flex items-center gap-2 text-rose-400 font-extrabold mb-1">
                                    <XCircle className="w-4 h-4" />
                                    <span>Task failed execution</span>
                                  </div>
                                  <p className="text-rose-300 mb-2">{task.error}</p>
                                  <div className="text-[10px] text-muted-foreground">
                                    Last synchronized check: {new Date(task.updatedAt).toLocaleString()}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-6">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 transition-colors disabled:cursor-not-allowed border border-white/5"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Page <span className="text-foreground font-extrabold">{page}</span> of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 transition-colors disabled:cursor-not-allowed border border-white/5"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="glass rounded-[2rem] p-12 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[50vh]">
              <Activity className="w-12 h-12 text-indigo-400 mb-4 animate-pulse" />
              <h2 className="text-lg font-bold text-foreground mb-1">No batch selected</h2>
              <p className="text-sm max-w-sm">
                Select one of the operations batches on the left history menu to view its real-time telemetry details.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
