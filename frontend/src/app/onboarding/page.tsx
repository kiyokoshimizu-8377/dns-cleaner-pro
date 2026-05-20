'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccounts, startAutoOnboarding, getRegistrarDomains } from '@/lib/api';

interface Account {
  id: string;
  providerName: string;
  email: string | null;
  label: string | null;
}

interface DryRunSummary {
  requested: number;
  normalized: number;
  duplicatesRemoved: number;
  invalid: number;
  alreadyInCloudflare: number;
  willCreateZones: number;
  willUpdateNameservers: number;
  manualNsRequired: number;
  skippedOwnershipVerification: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Form states
  const [mode, setMode] = useState<'FULL_ACCOUNT' | 'SELECTED_DOMAINS' | 'MANUAL_LIST'>('FULL_ACCOUNT');
  const [sourceId, setSourceId] = useState<string>('');
  const [destId, setDestId] = useState<string>('');
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [ownershipMode, setOwnershipMode] = useState<'NONE' | 'REGISTRAR_MATCH'>('NONE');

  // Mode-specific data states
  const [manualDomainsText, setManualDomainsText] = useState<string>('');
  const [registrarDomains, setRegistrarDomains] = useState<string[]>([]);
  const [selectedDomainsMap, setSelectedDomainsMap] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Loading & Error states
  const [loading, setLoading] = useState(false);
  const [fetchingDomains, setFetchingDomains] = useState(false);
  const [error, setError] = useState('');
  
  // Dry run result state
  const [dryRunResult, setDryRunResult] = useState<{
    summary: DryRunSummary;
    details: { willCreateZones: string[]; alreadyInCloudflare: string[] };
  } | null>(null);

  useEffect(() => {
    getAccounts()
       .then((data: any) => setAccounts(data))
       .catch((err: any) => console.error('Failed to fetch accounts', err));
  }, []);

  // Fetch registrar domains when selected domains mode is active and source account changes
  useEffect(() => {
    if (mode === 'SELECTED_DOMAINS' && sourceId) {
      setFetchingDomains(true);
      setRegistrarDomains([]);
      setSelectedDomainsMap({});
      setError('');
      
      getRegistrarDomains(sourceId)
        .then((res: any) => {
          setRegistrarDomains(res.domains || []);
        })
        .catch((err: any) => {
          setError('Failed to fetch domains from registrar. Check API credentials.');
        })
        .finally(() => {
          setFetchingDomains(false);
        });
    }
  }, [mode, sourceId]);

  const registrars = accounts.filter(a => ['namecheap', 'godaddy', 'spaceship'].includes(a.providerName.toLowerCase()));
  const cloudflares = accounts.filter(a => a.providerName.toLowerCase() === 'cloudflare');

  const filteredRegistrarDomains = registrarDomains.filter(d => 
    d.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelectAll = (select: boolean) => {
    const nextMap: Record<string, boolean> = {};
    if (select) {
      filteredRegistrarDomains.forEach(d => {
        nextMap[d] = true;
      });
    }
    setSelectedDomainsMap(nextMap);
  };

  const handleStartOnboarding = async (overrideDryRun = false) => {
    setError('');
    
    // Validations
    if (!destId) {
      setError('Please select a destination Cloudflare account.');
      return;
    }
    if ((mode === 'FULL_ACCOUNT' || mode === 'SELECTED_DOMAINS') && !sourceId) {
      setError('Please select a source registrar.');
      return;
    }

    let selectedDomains: string[] = [];
    if (mode === 'SELECTED_DOMAINS') {
      selectedDomains = Object.keys(selectedDomainsMap).filter(k => selectedDomainsMap[k]);
      if (selectedDomains.length === 0) {
        setError('Please select at least one domain to onboard.');
        return;
      }
    }

    let manualDomains: string[] = [];
    if (mode === 'MANUAL_LIST') {
      manualDomains = manualDomainsText
        .split('\n')
        .map(d => d.trim())
        .filter(d => d.length > 0);
      if (manualDomains.length === 0) {
        setError('Please paste or write at least one domain.');
        return;
      }
    }

    setLoading(true);
    setDryRunResult(null);

    const payload = {
      mode,
      cloudflareAccountId: destId,
      registrarAccountId: sourceId || undefined,
      selectedDomains: mode === 'SELECTED_DOMAINS' ? selectedDomains : undefined,
      manualDomains: mode === 'MANUAL_LIST' ? manualDomains : undefined,
      dryRun: overrideDryRun ? false : dryRun,
      ownershipVerificationMode: mode === 'MANUAL_LIST' ? ownershipMode : undefined,
    };

    try {
      const response = await startAutoOnboarding(payload);
      
      if (payload.dryRun) {
        setDryRunResult(response);
      } else {
        router.push('/sync-dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'An error occurred during onboarding setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-10 text-slate-100">
      {/* Header section with gradient glow */}
      <div className="relative p-6 rounded-2xl bg-slate-900/40 border border-slate-800 backdrop-blur-md overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
        
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
          Auto Onboarding Wizard
        </h1>
        <p className="mt-2 text-sm md:text-base text-slate-400 max-w-2xl">
          Provision Cloudflare zones dynamically and automate nameserver updates through multiple import strategies.
        </p>
      </div>

      {/* Main Glassmorphic Form Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl p-6 md:p-8 space-y-8 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-slate-950/30 rounded-2xl -z-10" />
        
        {error && (
          <div className="p-4 bg-red-950/40 border border-red-800/60 text-red-200 rounded-xl flex items-center space-x-3 text-sm">
            <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 1. Strategy selection */}
        <div className="space-y-4">
          <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">
            Select Import Strategy
          </label>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* FULL ACCOUNT IMPORT */}
            <div
              onClick={() => { setMode('FULL_ACCOUNT'); setDryRunResult(null); }}
              className={`flex flex-col p-5 rounded-2xl border cursor-pointer transition-all duration-300 relative ${
                mode === 'FULL_ACCOUNT'
                  ? 'border-blue-500 bg-blue-950/30 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              {mode === 'FULL_ACCOUNT' && (
                <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              )}
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${mode === 'FULL_ACCOUNT' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <span className="font-bold text-base text-slate-100">Full Account</span>
              </div>
              <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                Fetch and automatically onboard all domains associated with your registrar account.
              </p>
            </div>

            {/* SELECTED DOMAINS */}
            <div
              onClick={() => { setMode('SELECTED_DOMAINS'); setDryRunResult(null); }}
              className={`flex flex-col p-5 rounded-2xl border cursor-pointer transition-all duration-300 relative ${
                mode === 'SELECTED_DOMAINS'
                  ? 'border-blue-500 bg-blue-950/30 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              {mode === 'SELECTED_DOMAINS' && (
                <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              )}
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${mode === 'SELECTED_DOMAINS' ? 'bg-blue-50/10 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <span className="font-bold text-base text-slate-100">Selected Domains</span>
              </div>
              <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                Retrieve domain list from the registrar and select specific entries to migrate.
              </p>
            </div>

            {/* MANUAL LIST */}
            <div
              onClick={() => { setMode('MANUAL_LIST'); setDryRunResult(null); }}
              className={`flex flex-col p-5 rounded-2xl border cursor-pointer transition-all duration-300 relative ${
                mode === 'MANUAL_LIST'
                  ? 'border-blue-500 bg-blue-950/30 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              {mode === 'MANUAL_LIST' && (
                <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              )}
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${mode === 'MANUAL_LIST' ? 'bg-blue-50/10 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <span className="font-bold text-base text-slate-100">Manual List</span>
              </div>
              <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                Directly import an arbitrary list of domains by pasting them in bulk.
              </p>
            </div>
          </div>
        </div>

        {/* 2. Choose Accounts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800/60">
          {/* Source Registrar */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">
              Source Registrar Account {mode === 'MANUAL_LIST' && <span className="text-slate-500 font-normal">(Optional)</span>}
            </label>
            <div className="relative">
              <select
                value={sourceId}
                onChange={(e) => { setSourceId(e.target.value); setDryRunResult(null); }}
                className="w-full rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950 py-3 px-4 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all appearance-none cursor-pointer"
              >
                <option value="">{mode === 'MANUAL_LIST' ? 'Create Cloudflare zones only (No Registrar Link)' : 'Select Source Registrar'}</option>
                {registrars.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label || acc.email || acc.providerName} ({acc.providerName})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

          {/* Destination Cloudflare */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">
              Destination Cloudflare Account
            </label>
            <div className="relative">
              <select
                value={destId}
                onChange={(e) => { setDestId(e.target.value); setDryRunResult(null); }}
                className="w-full rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950 py-3 px-4 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all appearance-none cursor-pointer"
              >
                <option value="">Select Destination Cloudflare</option>
                {cloudflares.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label || acc.email || acc.providerName} (Cloudflare)
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Strategy Custom Fields */}
        {mode === 'SELECTED_DOMAINS' && (
          <div className="border border-slate-800 bg-slate-950/40 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800/60">
              <span className="text-sm font-bold text-slate-300 flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>Select domains to onboard:</span>
              </span>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleSelectAll(true)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-all"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-all"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Filter domains list..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {fetchingDomains ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400">Fetching registrar inventory...</span>
              </div>
            ) : filteredRegistrarDomains.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-500">
                {sourceId ? 'No matching domains found.' : 'Select a registrar account above to fetch domains.'}
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-900/60 border border-slate-800/80 rounded-xl bg-slate-950/80">
                {filteredRegistrarDomains.map(d => (
                  <label key={d} className="flex items-center space-x-3 px-4 py-3 hover:bg-slate-900/60 cursor-pointer transition-all">
                    <input
                      type="checkbox"
                      checked={!!selectedDomainsMap[d]}
                      onChange={(e) => {
                        setSelectedDomainsMap(prev => ({
                          ...prev,
                          [d]: e.target.checked
                        }));
                        setDryRunResult(null);
                      }}
                      className="h-4.5 w-4.5 rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-blue-500/30 focus:ring-offset-slate-900 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-300">{d}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'MANUAL_LIST' && (
          <div className="space-y-5 border border-slate-800 bg-slate-950/40 rounded-2xl p-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-300">
                Paste Domains (One per line)
              </label>
              <textarea
                rows={6}
                placeholder={`example1.com\nexample2.net\nhttps://mybrand.org`}
                value={manualDomainsText}
                onChange={(e) => { setManualDomainsText(e.target.value); setDryRunResult(null); }}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 font-mono transition-all"
              />
            </div>

            {sourceId && (
              <div className="pt-3 border-t border-slate-800/60 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Domain Verification Mode
                </label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <label className="flex items-center space-x-3 cursor-pointer p-3 border border-slate-800 bg-slate-950 rounded-xl flex-1 hover:border-slate-700 transition-all">
                    <input
                      type="radio"
                      name="ownershipMode"
                      checked={ownershipMode === 'NONE'}
                      onChange={() => { setOwnershipMode('NONE'); setDryRunResult(null); }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500/30"
                    />
                    <div>
                      <span className="block text-sm font-bold text-slate-200">No Match check</span>
                      <span className="block text-2xs text-slate-500 mt-0.5">Directly provision zones</span>
                    </div>
                  </label>
                  
                  <label className="flex items-center space-x-3 cursor-pointer p-3 border border-slate-800 bg-slate-950 rounded-xl flex-1 hover:border-slate-700 transition-all">
                    <input
                      type="radio"
                      name="ownershipMode"
                      checked={ownershipMode === 'REGISTRAR_MATCH'}
                      onChange={() => { setOwnershipMode('REGISTRAR_MATCH'); setDryRunResult(null); }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500/30"
                    />
                    <div>
                      <span className="block text-sm font-bold text-slate-200">Verify Ownership</span>
                      <span className="block text-2xs text-slate-500 mt-0.5">Enforce domain registrar link</span>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dry Run / Configuration Options */}
        <div className="pt-4 flex items-center justify-between border-t border-slate-800/60">
          <label className="flex items-center space-x-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => { setDryRun(e.target.checked); setDryRunResult(null); }}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white" />
            </div>
            <div className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">
              <span className="font-bold">Dry Run Mode</span> (Run full verification report and validations)
            </div>
          </label>
        </div>

        {/* Action Button */}
        <div className="pt-4 flex justify-end">
          <button
            onClick={() => handleStartOnboarding()}
            disabled={loading}
            className={`px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide text-white shadow-xl shadow-blue-950/20 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98 transition-all duration-200 ${
              loading
                ? 'bg-blue-800 cursor-not-allowed text-slate-400'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white'
            }`}
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <span className="h-4 w-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </span>
            ) : dryRun ? (
              'Preview Import'
            ) : (
              'Start Onboarding Workflow'
            )}
          </button>
        </div>
      </div>

      {/* Dry Run Report Summary UI (Glassmorphic Glow Widget) */}
      {dryRunResult && (
        <div className="bg-slate-900/60 border border-blue-900/40 backdrop-blur-xl rounded-2xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden animate-fade-in">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -z-10" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="bg-blue-500/10 text-blue-400 text-2xs font-extrabold uppercase px-2.5 py-1 rounded-md border border-blue-900/40">
                  Dry Run Report
                </span>
                <h3 className="text-xl font-bold text-slate-100">
                  Validation & Import Summary
                </h3>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Please review the structural breakdowns below before submitting to the job batch queue.
              </p>
            </div>
            
            <button
              onClick={() => setDryRunResult(null)}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Metric Grid Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border border-slate-800 bg-slate-950/40 rounded-xl">
              <span className="block text-2xs uppercase tracking-wider text-slate-500 font-semibold">Total Requested</span>
              <span className="text-2xl font-extrabold text-slate-200 mt-1 block">{dryRunResult.summary.requested}</span>
            </div>
            <div className="p-4 border border-slate-800 bg-slate-950/40 rounded-xl">
              <span className="block text-2xs uppercase tracking-wider text-slate-500 font-semibold">Valid & Cleaned</span>
              <span className="text-2xl font-extrabold text-blue-400 mt-1 block">{dryRunResult.summary.normalized}</span>
            </div>
            <div className="p-4 border border-slate-800 bg-slate-950/40 rounded-xl">
              <span className="block text-2xs uppercase tracking-wider text-slate-500 font-semibold">Invalid Excluded</span>
              <span className={`text-2xl font-extrabold mt-1 block ${dryRunResult.summary.invalid > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {dryRunResult.summary.invalid}
              </span>
            </div>
            <div className="p-4 border border-slate-800 bg-slate-950/40 rounded-xl">
              <span className="block text-2xs uppercase tracking-wider text-slate-500 font-semibold">Duplicates Cleaned</span>
              <span className="text-2xl font-extrabold text-slate-400 mt-1 block">{dryRunResult.summary.duplicatesRemoved}</span>
            </div>
          </div>

          {/* Details breakdown */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-5 space-y-3.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Skip Import (Already in Cloudflare)</span>
              <span className="font-bold text-slate-300">{dryRunResult.summary.alreadyInCloudflare}</span>
            </div>
            
            {mode === 'MANUAL_LIST' && ownershipMode === 'REGISTRAR_MATCH' && (
              <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-900/60">
                <span className="text-slate-400">Ownership Check Failed (Excluded)</span>
                <span className="font-bold text-red-400">{dryRunResult.summary.skippedOwnershipVerification}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-900/60">
              <span className="text-slate-200 font-semibold">Cloudflare Zones to be Created</span>
              <span className="font-bold text-blue-400 text-base">{dryRunResult.summary.willCreateZones}</span>
            </div>

            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-900/60">
              <div className="flex items-center space-x-2 text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                <span>Automatic Nameserver Update</span>
              </div>
              <span className="font-bold text-green-400">{dryRunResult.summary.willUpdateNameservers}</span>
            </div>

            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-900/60">
              <div className="flex items-center space-x-2 text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                <span>Manual Nameserver Update Required</span>
              </div>
              <span className="font-bold text-yellow-400">{dryRunResult.summary.manualNsRequired}</span>
            </div>
          </div>

          {dryRunResult.summary.willCreateZones > 0 ? (
            <div className="pt-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDryRunResult(null)}
                className="px-5 py-2.5 border border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStartOnboarding(true)}
                disabled={loading}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-xl shadow-blue-950/20 transition-all"
              >
                Confirm & Start Onboarding
              </button>
            </div>
          ) : (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center text-sm text-slate-400">
              No new zones need to be created. All input domains already exist in the destination account.
            </div>
          )}
        </div>
      )}
      
      {/* Information Panel */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden">
        <h3 className="text-lg font-bold text-slate-200 mb-3 flex items-center space-x-2">
          <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Onboarding Guidelines</span>
        </h3>
        <ul className="space-y-3.5 text-xs md:text-sm text-slate-400">
          <li className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-2xs">1</span>
            <span>Choose **Full Account** for bulk migration or **Selected Domains** to filter registrar inventory. Use **Manual List** for external domain inputs.</span>
          </li>
          <li className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-2xs">2</span>
            <span>If registrar details are supplied, nameservers will be automatically modified to point to Cloudflare custom nameservers. Otherwise, updates must be done manually at the external registrar.</span>
          </li>
          <li className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-2xs">3</span>
            <span>Always run a **Dry Run** check first to filter out typos, subdomains, duplicates, and domains that already exist on the destination.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
