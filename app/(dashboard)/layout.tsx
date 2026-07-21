import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen">
      {/* Fixed sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-400 text-sm font-bold text-primary-foreground shadow-sm">
            in
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-semibold tracking-tight">Outreach</span>
            <span className="text-[10px] text-muted-foreground">LinkedIn engine</span>
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

      {/* Content column, offset for the fixed sidebar */}
      <div className="flex min-h-screen flex-col md:pl-64">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <MobileNav />
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-blue-400 text-xs font-bold text-primary-foreground">
              in
            </div>
            <span className="font-semibold tracking-tight">Outreach</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
