"use client";

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loader2, Trash2, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function GlobalJobTracker() {
  const [show, setShow] = useState(false);

  // Poll active jobs every 3 seconds
  const { data: activeJobs = [] } = useQuery({
    queryKey: ['activeJobs'],
    queryFn: async () => {
      const res = await api.get('/domains/jobs/active');
      return res.data;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (activeJobs.length > 0) {
      setShow(true);
    } else if (show) {
      // Hide after a brief delay when finished
      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeJobs.length, show]);

  if (!show) return null;

  const activeJob = activeJobs.find((j: any) => j.status === 'active');
  const waitingJobs = activeJobs.filter((j: any) => j.status === 'waiting');

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-[#12141D]/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 animate-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Trash2 className="w-4 h-4 text-red-400" />
          <span>Background Cleaning</span>
        </div>
        <div className="text-xs font-medium text-white/50 bg-white/5 px-2 py-1 rounded-full">
          {activeJobs.length} Jobs
        </div>
      </div>

      {activeJobs.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-green-400 font-medium">
          <CheckCircle2 className="w-4 h-4" />
          All clean jobs completed!
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activeJob ? (
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/90 truncate mr-2 font-medium">
                  {activeJob.domainName}
                </span>
                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${activeJob.progress || 0}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-1.5 text-[10px] text-white/50 uppercase tracking-wider font-semibold">
                <span>Cleaning {activeJob.types ? activeJob.types.join(',') : 'ALL'}</span>
                <span>{activeJob.progress || 0}%</span>
              </div>
            </div>
          ) : null}

          {waitingJobs.length > 0 && (
            <div className="text-xs text-white/40 font-medium px-1">
              + {waitingJobs.length} domains waiting in queue...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
