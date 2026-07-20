"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { addTeamMember, removeTeamMember } from "@/app/(dashboard)/settings/actions";

export interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export function TeamManager({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" as "admin" | "member" });

  function add() {
    start(async () => {
      const res = await addTeamMember(form);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Member added");
        setForm({ name: "", email: "", password: "", role: "member" });
        setShowAdd(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{m.name ?? m.email}</span>{" "}
              <span className="text-muted-foreground">{m.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={m.role === "admin" ? "default" : "outline"}>{m.role}</Badge>
              {m.id !== currentUserId && (
                <RemoveButton id={m.id} />
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Temporary password (8+ chars)</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "member" })}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={add} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add member
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add member
        </Button>
      )}
    </div>
  );
}

function RemoveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await removeTeamMember(id);
            toast.success("Member removed");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
