"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Loader2, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function UserMenu({
  name,
  email,
  image,
  role,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const initials = (name || email || "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/50"
      >
        <Avatar className="h-8 w-8">
          {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name ?? email}</p>
          <p className="truncate text-xs text-muted-foreground capitalize">{role ?? "member"}</p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center gap-3 text-center">
            <Avatar className="h-16 w-16">
              {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <DialogTitle className="text-lg">{name ?? "Account"}</DialogTitle>
              {email && <p className="text-sm text-muted-foreground">{email}</p>}
              <Badge variant={role === "admin" ? "default" : "secondary"} className="capitalize">
                {role ?? "member"}
              </Badge>
            </div>
          </DialogHeader>

          <div className="mt-2 flex flex-col gap-2">
            <Button
              variant="outline"
              render={<Link href="/settings" onClick={() => setOpen(false)} />}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="destructive"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                void signOut({ redirectTo: "/login" });
              }}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
