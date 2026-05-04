"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Bell, Menu } from "lucide-react";

import { useAccountingAlerts } from "@/hooks/use-accounting-alerts";
import { ROUTES } from "@/lib/routes";
import { Badge } from "@/components/ui/badge";
import { TeamSwitcher } from "@/components/team-switcher";
import { NavUser } from "@/components/nav-user";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { clearAuthToken, getResolvedStoredUser } from "@/lib/auth-client";
import {
  filterErpNavModulesForUser,
  getActiveErpModule,
  type ErpNavModule,
} from "@/lib/erp-nav-config";

type NavUserState = {
  name: string;
  email: string;
  role?: string;
  userType?: "system" | "tenant" | "admin" | "pharmacy";
  tenantSlug?: string | null;
};

function readNavUserFromAuth(): NavUserState {
  const u = getResolvedStoredUser() as {
    name: string | null;
    email?: string;
    role?: string;
    userType?: "system" | "tenant" | "admin" | "pharmacy";
    tenantSlug?: string | null;
  } | null;
  if (!u) {
    return { name: "Guest", email: "Sign in" };
  }
  return {
    name: u.name?.trim() || u.email?.trim() || "User",
    email: u.email?.trim() ?? "",
    role: u.role,
    userType: u.userType,
    tenantSlug: u.tenantSlug ?? null,
  };
}

function ModuleLinks({
  modules,
  onNavigate,
}: {
  modules: ErpNavModule[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1 p-2">
      {modules.map((mod) => (
        <div key={mod.id} className="space-y-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mod.label}
          </p>
          {mod.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              onClick={() => onNavigate?.()}
              className={cn(
                "block rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted",
                pathname === c.href || pathname.startsWith(`${c.href}/`)
                  ? "bg-muted font-medium"
                  : "",
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AppTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { stats } = useAccountingAlerts();

  const [navUser, setNavUser] = React.useState<NavUserState>(() => {
    if (typeof window === "undefined") {
      return { name: "Guest", email: "Sign in" };
    }
    return readNavUserFromAuth();
  });

  const refreshNavUser = React.useCallback(() => {
    setNavUser(readNavUserFromAuth());
  }, []);

  React.useEffect(() => {
    refreshNavUser();
  }, [pathname, refreshNavUser]);

  React.useEffect(() => {
    const onFocus = () => refreshNavUser();
    const onVis = () => {
      if (document.visibilityState === "visible") refreshNavUser();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "auth_user") refreshNavUser();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshNavUser]);

  const modules = filterErpNavModulesForUser({
    userType: navUser.userType,
    role: navUser.role,
  });
  const isCashier = navUser.role?.toLowerCase() === "cashier";
  const showTeamSwitcher = !isCashier;
  const isAdmin = navUser.userType === "system" || navUser.userType === "admin";
  const homeHref = isAdmin ? "/admin" : "/dashboard";

  const handleLogout = React.useCallback(() => {
    clearAuthToken();
    router.push("/login");
  }, [router]);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 shadow-xs backdrop-blur-md supports-backdrop-filter:bg-background/80">
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center justify-self-start gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(100%,320px)] p-0">
              <SheetHeader className="border-b p-4 text-left">
                <SheetTitle>Modules</SheetTitle>
              </SheetHeader>
              <ModuleLinks
                modules={modules}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <Link
            href={homeHref}
            className="shrink-0 text-sm font-semibold tracking-tight text-primary"
          >
            PharmaCare
          </Link>
        </div>
        <div className="flex min-w-0 justify-center justify-self-center">
          <NavigationMenu
            viewport={false}
            delayDuration={220}
            skipDelayDuration={320}
            className="hidden min-w-0 justify-center overflow-visible lg:flex"
          >
            <NavigationMenuList className="flex-wrap justify-center gap-0.5 rounded-full border border-white/70 bg-background/80 px-1 py-0.5 backdrop-blur-sm">
              {modules.map((mod) => {
                const active =
                  getActiveErpModule(pathname, modules)?.id === mod.id;
                return (
                  <NavigationMenuItem key={mod.id}>
                    <NavigationMenuTrigger
                      className={cn(
                        navigationMenuTriggerStyle(),
                        active && "bg-muted",
                      )}
                    >
                      {mod.label}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="absolute top-full left-0 z-50">
                      <ul className="grid w-[220px] gap-0.5 p-2 bg-gray-50 rounded-lg">
                        {mod.children.map((child) => (
                          <li key={child.href}>
                            <NavigationMenuLink asChild>
                              <Link
                                href={child.href}
                                className={cn(
                                  pathname === child.href ||
                                    pathname.startsWith(`${child.href}/`)
                                    ? "bg-muted/70"
                                    : "",
                                )}
                              >
                                {child.label}
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="flex min-w-0 items-center justify-end justify-self-end gap-1.5 sm:gap-2">
          {!isAdmin ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2"
            >
              <Link href={ROUTES.accounting.controlCenter}>
                <Bell className="size-4" />
                <span className="hidden sm:inline">Alerts</span>
                <Badge
                  variant={stats.critical > 0 ? "destructive" : "secondary"}
                  className="h-4 px-1.5 text-[10px]"
                >
                  {stats.total}
                </Badge>
              </Link>
            </Button>
          ) : null}
          {showTeamSwitcher ? (
            <div className="flex h-9 min-w-0 max-w-[10rem] items-center border-r border-border/70 pr-2 sm:max-w-none sm:pr-3">
              <TeamSwitcher variant="header" />
            </div>
          ) : null}
          <div className="flex h-9 items-center rounded-md border border-border/60 bg-muted/40 px-0.5">
            <NavUser
              variant="header"
              user={{
                name: navUser.name,
                email: navUser.email,
                role: navUser.role,
                tenantSlug: navUser.tenantSlug,
              }}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
