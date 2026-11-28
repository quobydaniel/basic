import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";

import { adminListUsers, adminSetUserRole } from "@/lib/admin.functions";
import {
  AdminPage,
  AdminPanel,
  AdminPanelHead,
  AdminEmpty,
  AdminError,
  PearlBadge,
} from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/users")({
  component: AdminUsers,
});

const ROLES = ["admin", "staff", "rider", "seller", "buyer"] as const;
const ROLE_TONE = {
  admin: "ink",
  staff: "gold",
  rider: "gold",
  seller: "green",
  buyer: "muted",
} as const;

function AdminUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
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

  const rows = useMemo(() => {
    const all = (users.data ?? []) as {
      user_id: string;
      email: string;
      full_name: string | null;
      roles: string[];
      created_at: string;
    }[];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (u) => (u.full_name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users.data, search]);

  return (
    <AdminPage
      title="Users"
      subtitle="Manage platform roles. Every change goes through the admin server function and is re-verified server-side; RLS is the second net."
      actions={
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search users"
          className="pearl-input w-48 py-2 text-sm md:w-60"
        />
      }
    >
      {users.isLoading && (
        <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
          Loading users…
        </div>
      )}
      {users.error && <AdminError message={(users.error as Error).message} />}
      {users.data && (
        <AdminPanel>
          <AdminPanelHead title="Directory" hint={`${rows.length} shown`} />
          {rows.length === 0 ? (
            <AdminEmpty text={search ? `No users match “${search}”.` : "No users yet."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 md:px-5">User</th>
                    <th className="px-4 py-3">Roles</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Add role</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.user_id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 md:px-5">
                        <div className="font-medium">{u.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {u.roles.map((r) => (
                            <PearlBadge
                              key={r}
                              tone={ROLE_TONE[r as keyof typeof ROLE_TONE] ?? "muted"}
                            >
                              {r}
                              <button
                                aria-label={`Remove ${r}`}
                                title={`Remove ${r}`}
                                disabled={setRole.isPending}
                                onClick={() =>
                                  setRole.mutate({ user_id: u.user_id, role: r, action: "remove" })
                                }
                                className="opacity-60 hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </PearlBadge>
                          ))}
                          {u.roles.length === 0 && (
                            <span className="text-xs text-muted-foreground">none</span>
                          )}
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
                            setRole.mutate({
                              user_id: u.user_id,
                              role: e.target.value,
                              action: "add",
                            });
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
          )}
        </AdminPanel>
      )}
    </AdminPage>
  );
}
