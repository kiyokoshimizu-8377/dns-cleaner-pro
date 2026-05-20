"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import api, { massDeleteRecords, syncDomainRecords } from "@/lib/api";
import { 
  ArrowLeft, 
  Trash2, 
  RefreshCw, 
  Database,
  Globe,
  AlertCircle,
  CheckCircle2,
  Filter
} from "lucide-react";
import { useState } from "react";

export default function DomainDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);

  // Fetch Domain Details (including records)
  const { data: domain, isLoading } = useQuery({
    queryKey: ["domain", id],
    queryFn: async () => {
      const { data } = await api.get(`/domains/${id}`);
      return data;
    }
  });

  const cleanMutation = useMutation({
    mutationFn: (types: string[]) => massDeleteRecords(id as string, types),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["domain", id] });
      alert(`Successfully deleted ${data.deletedCount} records!`);
      setSelectedTypes([]);
    },
    onError: (error: any) => {
      alert("Error cleaning records: " + error.message);
    }
  });

  const syncRecordsMutation = useMutation({
    mutationFn: () => syncDomainRecords(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domain", id] });
      alert("Records synced successfully!");
    },
    onError: (error: any) => {
      alert("Error syncing records: " + error.message);
    }
  });

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  if (isLoading) return <div className="flex justify-center items-center h-screen"><RefreshCw className="animate-spin w-10 h-10 text-primary opacity-20" /></div>;

  const recordTypes = Array.from(new Set(domain?.records?.map((r: any) => r.type))) as string[];

  return (
    <div className="space-y-6">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Domains
        </button>

        <header className="flex justify-between items-end mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Globe className="text-primary w-6 h-6" />
              </div>
              <h1 className="text-3xl font-bold">{domain?.domainName}</h1>
            </div>
            <p className="text-muted-foreground">Managing {domain?.recordsCount} records on Cloudflare.</p>
          </div>

          <div className="flex gap-3">
             <button 
               disabled={syncRecordsMutation.isPending}
               onClick={() => syncRecordsMutation.mutate()}
               className="px-5 py-2.5 bg-secondary rounded-xl font-bold hover:bg-secondary/80 transition-colors flex items-center gap-2 disabled:opacity-50"
             >
               <RefreshCw className={`w-4 h-4 ${syncRecordsMutation.isPending ? "animate-spin" : ""}`} />
               {syncRecordsMutation.isPending ? "Syncing..." : "Sync Records"}
             </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Records Table */}
          <div className="lg:col-span-3">
            <div className="glass rounded-3xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-secondary/50 text-xs font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Content</th>
                    <th className="px-6 py-4">TTL</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {domain?.records?.map((record: any) => (
                    <tr key={record.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black ${
                          record.type === 'A' ? 'bg-blue-500/20 text-blue-400' :
                          record.type === 'CNAME' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {record.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-sm truncate max-w-[150px]">{record.name}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground truncate max-w-[200px]">{record.content}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{record.ttl}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mass Cleaner Panel */}
          <div className="space-y-6">
            <div className="glass p-6 rounded-3xl border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2 mb-4">
                <Trash2 className="text-primary w-5 h-5" />
                <h3 className="font-bold text-lg">Mass Cleaner</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Select record types you want to delete entirely from this domain.
              </p>

              <div className="space-y-3 mb-8">
                {recordTypes.map(type => (
                  <label key={type} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors border border-transparent has-[:checked]:border-primary/30 has-[:checked]:bg-primary/5">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-white/10 bg-secondary text-primary focus:ring-primary"
                      checked={selectedTypes.includes(type)}
                      onChange={() => toggleType(type)}
                    />
                    <span className="font-bold text-sm uppercase">{type}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {domain.records.filter((r: any) => r.type === type).length}
                    </span>
                  </label>
                ))}
              </div>

              <button 
                disabled={selectedTypes.length === 0 || cleanMutation.isPending}
                onClick={() => {
                  if(confirm(`Are you sure you want to delete ALL ${selectedTypes.join(', ')} records?`)) {
                    cleanMutation.mutate(selectedTypes);
                  }
                }}
                className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
              >
                {cleanMutation.isPending ? "Cleaning..." : `Delete Selected (${selectedTypes.length})`}
              </button>
            </div>

            <div className="glass p-6 rounded-3xl">
              <div className="flex items-center gap-2 mb-4 text-amber-500">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-bold">Caution</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Mass deletion is irreversible. Records will be removed from both this dashboard and Cloudflare immediately.
              </p>
            </div>
          </div>
        </div>
    </div>
  );
}
