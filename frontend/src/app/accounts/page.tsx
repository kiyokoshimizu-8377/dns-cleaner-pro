"use client";

import Sidebar from "@/components/Sidebar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccounts, syncAccount, createAccount, deleteAccount, updateAccount } from "@/lib/api";
import { 
  Plus, 
  RefreshCw, 
  Trash2, 
  ShieldCheck,
  Mail,
  Key,
  Cloud,
  ArrowUpRight,
  X,
  User,
  Tag,
  Shield,
  Edit2
} from "lucide-react";
import { useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newAccount, setNewAccount] = useState<{
    id?: string;
    label: string;
    providerName: string;
    apiKey: string;
    email: string;
  }>({
    label: "",
    providerName: "cloudflare",
    apiKey: "",
    email: ""
  });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts
  });

  const syncMutation = useMutation({
    mutationFn: syncAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      alert("Sync started successfully!");
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      const payload = { ...data };
      if (data.providerName !== 'cloudflare') {
        payload.apiSecret = data.email;
        payload.email = null;
      }
      return createAccount(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setShowForm(false);
      setNewAccount({ label: "", providerName: "cloudflare", apiKey: "", email: "" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => {
      const payload = { ...data };
      delete payload.id;
      if (data.providerName !== 'cloudflare') {
        payload.apiSecret = data.email;
        payload.email = null;
      } else {
        payload.apiSecret = null;
      }
      return updateAccount(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setShowForm(false);
      setNewAccount({ label: "", providerName: "cloudflare", apiKey: "", email: "" });
      alert("Account updated successfully!");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      alert("Account deleted successfully!");
    }
  });


  return (
    <>
      {/* Main Content Card */}
      <div className="glass flex-1 rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col overflow-hidden">
        <div className="p-10 flex-1 overflow-y-auto">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-3xl font-black tracking-tight">Manage Accounts</h2>
            <button 
              onClick={() => {
                setNewAccount({ label: "", providerName: "cloudflare", apiKey: "", email: "" });
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-8 py-3.5 bg-secondary text-foreground rounded-2xl font-black text-xs uppercase tracking-widest border border-white/5 hover:bg-white/10 transition-all shadow-xl"
            >
              <Plus className="w-4 h-4" />
              Add Account
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <div key={i} className="bg-secondary/30 h-56 rounded-3xl animate-pulse" />)}
            </div>
          ) : accounts?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-white/5 rounded-[2rem] bg-secondary/10">
              <div className="w-20 h-20 bg-secondary/50 rounded-3xl flex items-center justify-center mb-6">
                <Cloud className="w-10 h-10 text-muted-foreground opacity-30" />
              </div>
              <p className="text-muted-foreground font-bold text-lg text-center max-w-md px-6">
                No accounts configured. Add Cloudflare, GoDaddy, Namecheap, or Spaceship credentials to start.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts?.map((account: any) => (
                <div key={account.id} className="bg-secondary/40 p-6 rounded-[2rem] border border-white/5 group hover:border-primary/40 transition-all hover:-translate-y-2 shadow-lg">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                      <ShieldCheck className="text-primary w-8 h-8" />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => syncMutation.mutate(account.id)}
                        className="p-3 bg-background/50 rounded-xl hover:text-primary transition-colors disabled:opacity-50"
                        title="Sync Now"
                      >
                        <RefreshCw className={`w-5 h-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                      </button>
                      <button 
                        onClick={() => {
                          setNewAccount({
                            id: account.id,
                            label: account.label || "",
                            providerName: account.providerName,
                            apiKey: account.apiKey || "",
                            email: account.providerName === 'cloudflare' ? (account.email || "") : (account.apiSecret || "")
                          });
                          setShowForm(true);
                        }}
                        className="p-3 bg-background/50 rounded-xl hover:text-primary transition-colors"
                        title="Edit Account"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => {
                          if(confirm("Are you sure you want to delete this account?")) {
                            deleteMutation.mutate(account.id);
                          }
                        }}
                        className="p-3 bg-background/50 rounded-xl hover:text-red-500 transition-colors"
                        title="Delete Account"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-xl capitalize mb-4 truncate text-white" title={account.label || account.providerName}>
                    {account.label || account.providerName}
                  </h3>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium bg-background/30 p-2.5 rounded-xl border border-white/5">
                      <Mail className="w-4 h-4 shrink-0 text-primary" />
                      <span className="truncate">{account.email || "API Token Only"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium bg-background/30 p-2.5 rounded-xl border border-white/5">
                      <Key className="w-4 h-4 shrink-0 text-primary" />
                      <span>••••••••{account.apiKey.slice(-4)}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">Connected</span>
                    <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Details <ArrowUpRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass w-full max-w-lg rounded-[2rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 bg-secondary/30 border-b border-white/5 flex justify-between items-start">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center shrink-0">
                  {newAccount.id ? <Edit2 className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{newAccount.id ? "Edit Provider Account" : "Add Provider Account"}</h2>
                  <p className="text-muted-foreground text-xs font-medium">
                    {newAccount.id ? "Modify your DNS provider credentials." : "Connect a new DNS provider to your dashboard."}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 ml-1">Account Name (Internal)</label>
                <div className="relative">
                  <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. My Personal Account"
                    className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:ring-2 ring-primary transition-all text-sm font-medium"
                    value={newAccount.label}
                    onChange={(e) => setNewAccount({...newAccount, label: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 ml-1">Provider Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'cloudflare', name: 'Cloudflare', icon: Cloud },
                    { id: 'spaceship', name: 'Spaceship', icon: Shield },
                    { id: 'godaddy', name: 'GoDaddy', icon: ShieldCheck },
                    { id: 'namecheap', name: 'Namecheap', icon: Tag },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setNewAccount({...newAccount, providerName: p.id})}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        newAccount.providerName === p.id 
                          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20' 
                          : 'border-white/5 bg-secondary/30 hover:border-white/10'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg bg-background flex items-center justify-center shrink-0 shadow-sm`}>
                         <p.icon className={`w-4 h-4 ${newAccount.providerName === p.id ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${newAccount.providerName === p.id ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 pt-1">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 ml-1">API Token / Key</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                      type="password"
                      autoComplete="new-password"
                      placeholder="Enter API Token / Key"
                      className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:ring-2 ring-primary transition-all text-sm"
                      value={newAccount.apiKey}
                      onChange={(e) => setNewAccount({...newAccount, apiKey: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 ml-1">
                    {newAccount.providerName === 'cloudflare' ? 'Email (Optional)' : 
                     newAccount.providerName === 'namecheap' ? 'Username' : 'API Secret'}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                      type={newAccount.providerName === 'cloudflare' ? 'email' : 'text'}
                      autoComplete="off"
                      placeholder={
                        newAccount.providerName === 'cloudflare' ? "account@email.com" : 
                        newAccount.providerName === 'namecheap' ? "Username" : "Paste your secret here"
                      }
                      className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:ring-2 ring-primary transition-all text-sm"
                      value={newAccount.email}
                      onChange={(e) => setNewAccount({...newAccount, email: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-secondary/20 border-t border-white/5 flex gap-4 justify-between items-center">
              <button 
                onClick={() => setShowForm(false)} 
                className="px-6 py-3 font-bold text-xs text-muted-foreground hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (newAccount.id) {
                    updateMutation.mutate({ id: newAccount.id, data: newAccount });
                  } else {
                    createMutation.mutate(newAccount);
                  }
                }}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-8 py-3 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-3 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {newAccount.id ? "Save Changes" : "Verify & Add Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
