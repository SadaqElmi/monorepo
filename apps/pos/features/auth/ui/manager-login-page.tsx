"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setAuthToken, type StoredUser } from "@/lib/auth-client";
import { usePos } from "@/components/pos-context";
import { login } from "@/lib/services/auth";
import { prefetchPosRegisterData } from "@/lib/prefetch-register-data";
import { POS_BRAND_COLOR } from "@/features/register/model/constants";

export function ManagerLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setManagerPrivilegesSuspended } = usePos();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenantHint, setTenantHint] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved =
        localStorage.getItem("posTenantSlug") ??
        process.env.NEXT_PUBLIC_DEFAULT_TENANT ??
        "";
      setTenantHint(saved.trim());
    } catch {
      // ignore
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setError("Enter your email and password (at least 6 characters).");
      return;
    }
    setLoading(true);
    try {
      let branchId: string | undefined;
      try {
        const b = localStorage.getItem("branchId");
        if (b && b.toLowerCase() !== "all") branchId = b;
      } catch {
        // ignore
      }

      const res = await login(trimmedEmail, password, tenantHint || undefined);

      if (res.userType === "system") {
        setError(
          "System administrator accounts cannot sign in from a POS terminal.",
        );
        return;
      }

      const user: StoredUser = {
        id: res.user.id,
        email: res.user.email ?? "",
        name: res.user.name,
        userType: res.userType,
        role: res.role,
        tenantId: res.tenantId ?? undefined,
        tenantSlug: res.tenantSlug ?? undefined,
        assignedBranchId: res.assignedBranchId,
        allowedBranchIds: res.allowedBranchIds,
      };

      setAuthToken(res.token, user);
      setManagerPrivilegesSuspended(false);

      try {
        if (res.tenantSlug) {
          localStorage.setItem("posTenantSlug", res.tenantSlug);
        }
        const initialBranchId =
          branchId ?? res.assignedBranchId ?? res.defaultBranchId;
        if (initialBranchId) {
          localStorage.setItem("branchId", initialBranchId);
        }
      } catch {
        // ignore
      }

      const slug = res.tenantSlug?.trim();
      if (slug) {
        prefetchPosRegisterData(queryClient, slug);
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6"
      style={{
        ["--pos-brand" as string]: POS_BRAND_COLOR,
        background: `linear-gradient(160deg, ${POS_BRAND_COLOR}18 0%, #0f172a08 45%)`,
      }}
    >
      <Card className="w-full max-w-md overflow-hidden shadow-xl">
        <CardContent className="p-8">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="text-xl font-bold tracking-tight text-(--pos-brand)">
              Manager Sign In
            </h1>
            <p className="text-xs text-muted-foreground">
              Use your manager email and password to unlock this terminal.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="manager-email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="manager-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  required
                  className="h-11 pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manager-password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="manager-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                  minLength={6}
                  className="h-11 pl-10 pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {tenantHint ? (
              <p className="text-xs text-muted-foreground">
                Pharmacy:{" "}
                <span className="font-mono font-medium text-foreground">
                  {tenantHint}
                </span>
              </p>
            ) : null}

            {error ? (
              <p className="text-sm font-medium text-destructive">{error}</p>
            ) : null}

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full font-semibold"
              style={{ backgroundColor: POS_BRAND_COLOR, color: "#fff" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs">
            <Link
              href="/staff-login"
              className="font-medium text-(--pos-brand) underline underline-offset-3"
            >
              Use Staff ID + PIN instead
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to terminal
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
