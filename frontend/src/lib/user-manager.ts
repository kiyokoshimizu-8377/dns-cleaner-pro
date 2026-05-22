export type UserRoleId = string;
export type UserStatus = "active" | "inactive";

export type PermissionId =
  | "read_all"
  | "perm_manage_accounts"
  | "perm_edit_dns"
  | "perm_manage_users"
  | "perm_crud_api";

export const PERMISSION_LABELS: Record<PermissionId, string> = {
  read_all: "Tout lire",
  perm_manage_accounts: "perm_manage_accounts",
  perm_edit_dns: "perm_edit_dns",
  perm_manage_users: "Gérer utilisateurs",
  perm_crud_api: "perm_crud_api",
};

export const ALL_PERMISSIONS: PermissionId[] = [
  "read_all",
  "perm_manage_accounts",
  "perm_edit_dns",
  "perm_manage_users",
  "perm_crud_api",
];

export type AppRole = {
  id: UserRoleId;
  name: string;
  description: string;
  permissions: PermissionId[];
  isSystem?: boolean;
};

export type AppUser = {
  id: string;
  username: string;
  email: string;
  password: string;
  role: UserRoleId;
  status: UserStatus;
};

const USERS_KEY = "dns_cleaner_users";
const ROLES_KEY = "dns_cleaner_roles";

export const DEFAULT_ROLES: AppRole[] = [
  {
    id: "super_admin",
    name: "super_admin",
    description: "Full system access",
    permissions: [...ALL_PERMISSIONS],
    isSystem: true,
  },
  {
    id: "admin",
    name: "admin",
    description: "Administrative access",
    permissions: [
      "read_all",
      "perm_manage_accounts",
      "perm_edit_dns",
      "perm_manage_users",
    ],
    isSystem: true,
  },
  {
    id: "user",
    name: "user",
    description: "Standard user access",
    permissions: ["read_all", "perm_edit_dns"],
    isSystem: true,
  },
  {
    id: "viewer",
    name: "viewer",
    description: "Read-only access",
    permissions: ["read_all"],
    isSystem: true,
  },
];

export const DEFAULT_USERS: AppUser[] = [
  {
    id: "u-admin",
    username: "admin",
    email: "admin@test.com",
    password: "admin",
    role: "super_admin",
    status: "active",
  },
];

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function migrateLegacyUsers(raw: unknown[]): AppUser[] {
  return raw.map((item, index) => {
    const legacy = item as Partial<AppUser> & {
      username?: string;
      email?: string;
      password?: string;
    };
    return {
      id: legacy.id ?? `u-legacy-${index}-${legacy.username ?? "user"}`,
      username: legacy.username ?? "user",
      email: legacy.email ?? "",
      password: legacy.password ?? "",
      role: legacy.role ?? "admin",
      status: legacy.status ?? "active",
    };
  });
}

export function loadRoles(): AppRole[] {
  if (typeof window === "undefined") return DEFAULT_ROLES;
  const stored = safeParse<AppRole[]>(localStorage.getItem(ROLES_KEY), []);
  if (stored.length === 0) {
    localStorage.setItem(ROLES_KEY, JSON.stringify(DEFAULT_ROLES));
    return DEFAULT_ROLES;
  }
  const merged = [...DEFAULT_ROLES];
  for (const role of stored) {
    if (!merged.some((r) => r.id === role.id)) {
      merged.push(role);
    }
  }
  return merged;
}

export function saveRoles(roles: AppRole[]): void {
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
}

export function loadUsers(): AppUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  const parsed = safeParse<unknown[]>(raw, []);
  const users = migrateLegacyUsers(parsed);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return users;
}

export function saveUsers(users: AppUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getCurrentUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("currentUser");
  if (!raw) return null;
  const parsed = safeParse<Partial<AppUser>>(raw, {});
  const users = loadUsers();
  return (
    users.find(
      (u) =>
        u.username === parsed.username ||
        u.email === parsed.email ||
        u.id === parsed.id,
    ) ?? null
  );
}

export function roleHasPermission(
  role: AppRole | undefined,
  permission: PermissionId,
): boolean {
  if (!role) return false;
  if (role.id === "super_admin") return true;
  return role.permissions.includes(permission);
}

export function formatPermissionLabel(
  role: AppRole,
  permission: PermissionId,
): string {
  if (role.id === "super_admin") return "Accès total (Super Admin)";
  return PERMISSION_LABELS[permission];
}

export function getRoleDisplayPermissions(role: AppRole): string[] {
  if (role.id === "super_admin") {
    return ["Accès total (Super Admin)"];
  }
  return role.permissions.map((p) => PERMISSION_LABELS[p]);
}

export function canDeleteUser(target: AppUser, actor: AppUser | null): boolean {
  if (target.role === "super_admin") return false;
  if (actor && target.id === actor.id) return false;
  return true;
}

export function canEditUserRole(target: AppUser): boolean {
  return target.role !== "super_admin";
}
