import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";

import { adminListUsers, adminSetUserRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/quoby/users")({
  component: AdminUsers,
});

const ROLES = ["admin", "staff", "rider", "seller", "buyer"] as const;
const ROLE_BADGE: Record<string, string> = {
  admin: "bg-primary text-primary-foreground",
  staff: "bg-amber-500/20 text-foreground",
  rider: "bg-blue-500/20 text-foreground",
  seller: "bg-emerald-500/20 text-foreground",
  buyer: "bg-muted text-muted-foreground",
};

function AdminUsers() {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminListUsers(),
  });

  const setRole = useMutation({
    mutationFn: (v: { user_id: string; role: string; action: "add" | "remove" }) =>
      adminSetUserRole({ data: v as never }),
    onSuccess: (_d, v) => {
      toast.success(v.action === "add" ? `Role ${v.role} added` : `Role ${v.role} removed`);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (users.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading users…</div>;
  if (users.error) return <div className="p-6 text-sm text-destructive">Failed to load users: {(users.error as Error).message}</div>;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-2xl">Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage roles across the platform.</p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Add role</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.user_id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[r] ?? "bg-muted"}`}
                      >
                        {r}
                        <button
                          aria-label={`Remove ${r}`}
                          title={`Remove ${r}`}
                          disabled={setRole.isPending}
                          onClick={() => setRole.mutate({ user_id: u.user_id, role: r, action: "remove" })}
                          className="opacity-60 hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {u.roles.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Add role to ${u.email}`}
                    defaultValue=""
                    disabled={setRole.isPending}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setRole.mutate({ user_id: u.user_id, role: e.target.value, action: "add" });
                      e.target.value = "";
                    }}
                    className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="">Add…</option>
                    {ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
