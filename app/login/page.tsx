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
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-semibold">
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
