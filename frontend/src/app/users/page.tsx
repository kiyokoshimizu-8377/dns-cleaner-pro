"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Trash2,
  Eye,
  X,
  Shield,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "@/lib/api";
import { AuthUser, getStoredUser } from "@/lib/auth";
import { loadRoles } from "@/lib/user-manager";

function UserAvatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-primary/20 text-primary font-black text-sm flex items-center justify-center shrink-0">
      {initial}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [roles, setRoles] = useState(loadRoles());
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewUser, setViewUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      setError("Impossible de charger les utilisateurs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRoles(loadRoles());
    setCurrentUser(getStoredUser());
    void fetchUsers();
  }, []);

  const handleAdd = async () => {
    setError("");
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("Tous les champs sont obligatoires.");
      return;
    }
    try {
      await createUser({
        username: username.trim(),
        email: email.trim(),
        password,
        role,
      });
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("user");
      setShowAdd(false);
      await fetchUsers();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Erreur lors de la création";
      setError(Array.isArray(message) ? message.join(", ") : String(message));
    }
  };

  const handleRoleChange = async (user: AuthUser, newRole: string) => {
    if (user.role === "super_admin") return;
    try {
      await updateUser(user.id, { role: newRole });
      await fetchUsers();
    } catch {
      setError("Impossible de modifier le rôle.");
    }
  };

  const handleStatusChange = async (user: AuthUser, status: string) => {
    try {
      await updateUser(user.id, { status });
      await fetchUsers();
    } catch {
      setError("Impossible de modifier le statut.");
    }
  };

  const handleDelete = async (target: AuthUser) => {
    if (target.role === "super_admin") return;
    if (currentUser?.id === target.id) return;
    if (!confirm(`Supprimer l'utilisateur "${target.username}" ?`)) return;
    try {
      await deleteUser(target.id);
      await fetchUsers();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Suppression impossible";
      setError(Array.isArray(message) ? message.join(", ") : String(message));
    }
  };

  const assignableRoles = roles.filter((r) => r.id !== "super_admin");

  return (
    <div className="space-y-6">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-black tracking-tight mb-2">
          Gestion utilisateurs
        </h2>
        <p className="text-sm text-muted-foreground font-medium">
          Utilisateurs stockés en base de données avec authentification JWT.
        </p>
      </div>

      <div className="glass rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-4 bg-secondary/20">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-primary" />
            <span className="font-black text-sm uppercase tracking-widest">
              Utilisateurs
            </span>
            <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest">
              {users.length} utilisateurs
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void fetchUsers()}
              className="p-2.5 rounded-xl border border-white/10 hover:bg-white/5"
              title="Actualiser"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <Link
              href="/roles"
              className="px-4 py-2 rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Rôles & Permissions
            </Link>
            <button
              onClick={() => {
                setError("");
                setShowAdd(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/30 hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Ajouter un utilisateur
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-16 flex justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary opacity-40" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-primary/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const editableRole = user.role !== "super_admin";
                  const deletable =
                    user.role !== "super_admin" &&
                    currentUser?.id !== user.id;
                  return (
                    <tr
                      key={user.id}
                      className="border-t border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={user.username} />
                          <span className="font-bold">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-medium">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={user.role}
                          disabled={!editableRole}
                          onChange={(e) =>
                            void handleRoleChange(user, e.target.value)
                          }
                          className="bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold min-w-[140px] disabled:opacity-60"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={user.status}
                          onChange={(e) =>
                            void handleStatusChange(user, e.target.value)
                          }
                          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border cursor-pointer ${
                            user.status === "active"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/15 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          <option value="active">active</option>
                          <option value="inactive">inactive</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewUser(user)}
                            className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-white/5"
                            title="Voir les détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {deletable ? (
                            <button
                              onClick={() => void handleDelete(user)}
                              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="w-9" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error && (
          <p className="px-8 py-3 text-sm text-red-500 font-medium border-t border-white/5">
            {error}
          </p>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md">
          <div className="glass w-full max-w-md rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-secondary/30">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">Nouvel utilisateur</h3>
              </div>
              <button
                onClick={() => setShowAdd(false)}
                className="p-2 hover:bg-white/5 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 px-4 text-sm"
                placeholder="Nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 px-4 text-sm"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 px-4 text-sm"
                placeholder="Mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <select
                className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 px-4 text-sm font-bold"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={() => void handleAdd()}
                className="w-full py-3 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest"
              >
                Créer l&apos;utilisateur
              </button>
            </div>
          </div>
        </div>
      )}

      {viewUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md">
          <div className="glass w-full max-w-md rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center">
              <h3 className="font-bold text-lg">Détails utilisateur</h3>
              <button
                onClick={() => setViewUser(null)}
                className="p-2 hover:bg-white/5 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <UserAvatar name={viewUser.username} />
                <div>
                  <p className="font-bold text-lg">{viewUser.username}</p>
                  <p className="text-muted-foreground">{viewUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/30 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Rôle
                  </p>
                  <p className="font-bold">{viewUser.role}</p>
                </div>
                <div className="bg-secondary/30 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Statut
                  </p>
                  <p className="font-bold capitalize">{viewUser.status}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
