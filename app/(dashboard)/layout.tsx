import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-400 text-sm font-bold text-primary-foreground shadow-sm">
            in
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-semibold tracking-tight">Outreach</span>
            <span className="text-[10px] text-muted-foreground">LinkedIn engine</span>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav />
        </div>
        <div className="border-t p-2">
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
            role={session.user.role}
          />
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
