"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Plus, Pencil, Trash2, X, Users } from "lucide-react";
import {
  ALL_PERMISSIONS,
  AppRole,
  PERMISSION_LABELS,
  PermissionId,
  getRoleDisplayPermissions,
  loadRoles,
  saveRoles,
} from "@/lib/user-manager";

export default function RolesPage() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AppRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<PermissionId[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setRoles(loadRoles());
  }, []);

  const persist = (next: AppRole[]) => {
    saveRoles(next);
    setRoles(next);
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setPermissions(["read_all"]);
    setError("");
    setShowForm(true);
  };

  const openEdit = (role: AppRole) => {
    setEditing(role);
    setName(role.name);
    setDescription(role.description);
    setPermissions([...role.permissions]);
    setError("");
    setShowForm(true);
  };

  const togglePermission = (perm: PermissionId) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleSave = () => {
    setError("");
    const trimmedName = name.trim().toLowerCase().replace(/\s+/g, "_");
    if (!trimmedName || !description.trim()) {
      setError("Nom et description sont obligatoires.");
      return;
    }
    if (permissions.length === 0) {
      setError("Sélectionnez au moins une permission.");
      return;
    }

    if (editing) {
      persist(
        roles.map((r) =>
          r.id === editing.id
            ? {
                ...r,
                name: trimmedName,
                description: description.trim(),
                permissions,
              }
            : r,
        ),
      );
    } else {
      if (roles.some((r) => r.id === trimmedName || r.name === trimmedName)) {
        setError("Ce rôle existe déjà.");
        return;
      }
      persist([
        ...roles,
        {
          id: trimmedName,
          name: trimmedName,
          description: description.trim(),
          permissions,
        },
      ]);
    }
    setShowForm(false);
  };

  const handleDelete = (role: AppRole) => {
    if (role.isSystem) {
      setError("Les rôles système ne peuvent pas être supprimés.");
      return;
    }
    if (!confirm(`Supprimer le rôle "${role.name}" ?`)) return;
    persist(roles.filter((r) => r.id !== role.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <h2 className="text-3xl font-black tracking-tight">
              Rôles & Permissions
            </h2>
          </div>
          <p className="text-sm text-muted-foreground font-medium max-w-xl">
            Gérer les niveaux d&apos;accès et les permissions granulaires de la
            plateforme.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/users"
            className="px-4 py-2 rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Gestion utilisateurs
          </Link>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/30"
          >
            <Plus className="w-4 h-4" />
            Ajouter un rôle
          </button>
        </div>
      </div>

      <div className="glass rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-primary/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-4">Nom du rôle</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Permissions</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr
                  key={role.id}
                  className="border-t border-white/5 hover:bg-white/[0.02]"
                >
                  <td className="px-6 py-4 font-bold">{role.name}</td>
                  <td className="px-6 py-4 text-muted-foreground font-medium">
                    {role.description}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2 max-w-lg">
                      {getRoleDisplayPermissions(role).map((label) => (
                        <span
                          key={label}
                          className="px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-[10px] font-bold border border-primary/20"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(role)}
                        className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-white/5"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!role.isSystem && (
                        <button
                          onClick={() => handleDelete(role)}
                          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && !showForm && (
          <p className="px-6 py-3 text-sm text-red-500 border-t border-white/5">
            {error}
          </p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md">
          <div className="glass w-full max-w-lg rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-secondary/30 sticky top-0">
              <h3 className="font-bold text-lg">
                {editing ? "Modifier le rôle" : "Nouveau rôle"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-white/5 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 px-4 text-sm disabled:opacity-60"
                placeholder="Nom du rôle (ex: tester)"
                value={name}
                disabled={!!editing?.isSystem}
                onChange={(e) => setName(e.target.value)}
              />
              <textarea
                className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 px-4 text-sm min-h-[80px]"
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                  Permissions
                </p>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-white/5 cursor-pointer hover:bg-secondary/50"
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                        className="accent-primary"
                      />
                      <span className="text-sm font-medium">
                        {PERMISSION_LABELS[perm]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={handleSave}
                className="w-full py-3 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest"
              >
                {editing ? "Enregistrer" : "Créer le rôle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
