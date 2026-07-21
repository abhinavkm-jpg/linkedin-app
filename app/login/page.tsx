import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  // First-run setup: if no users exist, show the admin creation form.
  let needsSetup = false;
  try {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    needsSetup = existing.length === 0;
  } catch {
    // DB not reachable yet — assume login; the error will surface on submit.
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50 via-background to-violet-50" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <Card className="relative w-full max-w-sm shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-400 text-lg font-bold text-primary-foreground shadow-md">
            in
          </div>
          <CardTitle className="text-xl">LinkedIn Outreach</CardTitle>
          <CardDescription>
            {needsSetup
              ? "Create the first admin account to get started."
              : "Sign in to your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm mode={needsSetup ? "register" : "login"} />
        </CardContent>
      </Card>
    </div>
  );
}
