"use client";

import { LogOut, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatRole(role: string) {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function NavUser({
  user,
  onLogout,
  variant = "sidebar",
}: {
  user: {
    name: string;
    email: string;
    avatar?: string;
    role?: string;
    tenantSlug?: string | null;
  };
  onLogout: () => void;
  variant?: "sidebar" | "header";
}) {
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const isGuest = user.name === "Guest";

  const secondaryLine =
    user.email?.trim() ||
    (user.role ? formatRole(user.role) : "") ||
    (user.tenantSlug?.trim() ? `Tenant: ${user.tenantSlug}` : "") ||
    (isGuest ? "" : "—");

  const trigger = (
    <Button
      variant={variant === "header" ? "ghost" : "ghost"}
      className={
        variant === "header"
          ? "h-9 max-w-[11rem] gap-2 px-2 sm:max-w-[13rem]"
          : "h-12 w-full justify-start gap-2 px-2"
      }
    >
      <Avatar className="size-8 shrink-0 rounded-lg">
        <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{user.name}</span>
        {secondaryLine ? (
          <span className="truncate text-xs text-muted-foreground">
            {secondaryLine}
          </span>
        ) : null}
      </div>
    </Button>
  );

  if (variant === "header") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="end" forceMount>
          <DropdownMenuLabel className="space-y-2 font-normal">
            <div className="flex items-center gap-2">
              <Avatar className="size-9 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-semibold leading-none">
                  {user.name}
                </p>
                {user.email?.trim() ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                ) : null}
                {user.role ? (
                  <p className="text-xs text-muted-foreground">
                    Role:{" "}
                    <span className="font-medium text-foreground">
                      {formatRole(user.role)}
                    </span>
                  </p>
                ) : null}
                {user.tenantSlug?.trim() ? (
                  <p className="truncate text-xs text-muted-foreground">
                    Workspace:{" "}
                    <span className="font-mono text-foreground">
                      {user.tenantSlug}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="mr-2 size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" side="right">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-muted-foreground text-xs leading-none">
              {user.email}
            </p>
            {user.role ? (
              <p className="text-muted-foreground text-xs">Role: {user.role}</p>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="mr-2 size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
