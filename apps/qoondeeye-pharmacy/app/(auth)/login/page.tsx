"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { syncActiveBranchCookie, clearActiveBranchCookies } from "@/lib/branch-cookie";
import { getResolvedStoredUser, setAuthToken, type StoredUser } from "@/lib/auth-client";
import { login } from "@/lib/api";
import { reconcileClientBranchSelection } from "@/lib/branch-reconcile";
import {
  ApiError,
  formatApiErrorForUser,
} from "@/lib/services/http";
import { loginSchema, validateForSubmit } from "@/lib/validation";
import { getAdminDashboardUrl } from "@/lib/admin-dashboard-url";
import { prefetchErpCoreAfterLogin } from "@/lib/erp-query-prefetch";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { isCoolingDown, secondsLeft, applyRateLimit } = useRateLimitCooldown();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || isCoolingDown) return;
    setError("");
    const validated = validateForSubmit(loginSchema, {
      email: email.trim(),
      password,
    });
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    setLoading(true);
    try {
      const res = await login(validated.data.email, validated.data.password);
      const previousUser = getResolvedStoredUser();
      const previousTenant = previousUser?.tenantSlug?.trim().toLowerCase();
      const newTenant = res.tenantSlug?.trim().toLowerCase();
      const tenantChanged =
        Boolean(previousTenant) &&
        Boolean(newTenant) &&
        previousTenant !== newTenant;

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
        canViewAllBranches: res.canViewAllBranches,
      };
      setAuthToken(res.token, user);
      try {
        if (tenantChanged) {
          localStorage.removeItem("branchId");
          localStorage.removeItem("branchName");
          clearActiveBranchCookies();
        }
        const initialBranchId = res.assignedBranchId ?? res.defaultBranchId;
        if (initialBranchId) {
          localStorage.setItem("branchId", initialBranchId);
          syncActiveBranchCookie(initialBranchId);
        } else if (tenantChanged) {
          localStorage.removeItem("branchId");
        }
        reconcileClientBranchSelection(res.allowedBranchIds);
      } catch {
        // ignore
      }
      const slug = res.tenantSlug?.trim();
      if (slug && res.userType !== "system") {
        void prefetchErpCoreAfterLogin(queryClient, slug);
      }
      if (res.userType === "system") {
        window.location.href = getAdminDashboardUrl("/login");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      if (applyRateLimit(err) && err instanceof ApiError) {
        const wait = err.retryAfterSeconds ?? 30;
        setError(
          `Too many sign-in attempts. Wait ${wait}s and try again.`,
        );
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError(formatApiErrorForUser(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-sans bg-background min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-2 flex items-center gap-2">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground">
              <Stethoscope className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              PharmaCare
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pharmacy Management System
          </p>
        </div>

        <Card className="overflow-hidden shadow-xl">
          <CardContent className="p-8">
            <div className="mb-6 space-y-1">
              <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
              <p className="text-sm text-muted-foreground">
                Enter your email and password. Your role and dashboard are
                determined by your account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 pl-10 pr-11"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowPassword((p) => !p)}
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

              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading || isCoolingDown}
                className="flex h-11 w-full items-center justify-center gap-2 shadow-md shadow-primary/20"
              >
                {loading
                  ? "Signing in…"
                  : isCoolingDown
                    ? `Wait ${secondsLeft}s…`
                    : "Sign In"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>© 2024 PharmaCare. All rights reserved.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link href="#" className="hover:text-primary">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-primary">
              Terms of Service
            </Link>
            <Link href="#" className="hover:text-primary">
              Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
