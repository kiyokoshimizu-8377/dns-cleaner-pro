"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Trash2 } from "lucide-react";

type StoredUser = {
  username: string;
  email: string;
  password: string;
};

function loadUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem("dns_cleaner_users");
  if (!raw) {
    const defaults = [{ username: "admin", email: "admin@test.com", password: "admin" }];
    localStorage.setItem("dns_cleaner_users", JSON.stringify(defaults));
    return defaults;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setUsers(loadUsers());
  }, []);

  const saveUsers = (next: StoredUser[]) => {
    localStorage.setItem("dns_cleaner_users", JSON.stringify(next));
    setUsers(next);
  };

  const handleAdd = () => {
    setError("");
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required.");
      return;
    }
    const exists = users.some(
      (u) =>
        u.username.toLowerCase() === username.trim().toLowerCase() ||
        u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (exists) {
      setError("Username or email already exists.");
      return;
    }
    const next = [
      ...users,
      {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
      },
    ];
    saveUsers(next);
    setUsername("");
    setEmail("");
    setPassword("");
  };

  const handleDelete = (target: StoredUser) => {
    if (users.length <= 1) {
      setError("At least one user must remain.");
      return;
    }
    if (!confirm(`Delete user "${target.username}"?`)) return;
    saveUsers(users.filter((u) => u.username !== target.username));
  };

  return (
    <div className="glass flex-1 rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
      <div className="p-10 space-y-8">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          <h2 className="text-3xl font-black tracking-tight">Users Management</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              Registered Users
            </h3>
            {users.map((user) => (
              <div
                key={user.username}
                className="flex items-center justify-between bg-secondary/40 p-4 rounded-2xl border border-white/5"
              >
                <div>
                  <p className="font-bold">{user.username}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <button
                  onClick={() => handleDelete(user)}
                  className="p-2 rounded-xl hover:text-red-500 transition-colors"
                  title="Delete user"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-secondary/30 p-6 rounded-[2rem] border border-white/5 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add User
            </h3>
            <input
              className="w-full bg-secondary/50 border border-white/5 rounded-xl py-3 px-4 text-sm"
              placeholder="Username"
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
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
            <button
              onClick={handleAdd}
              className="w-full py-3 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest"
            >
              Add User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
