"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuthToken, type StoredUser } from "@/lib/auth-client";
import { login } from "@/lib/api";
import {
  ApiError,
  formatApiErrorForUser,
} from "@/lib/services/http";
import { loginSchema, validateForSubmit } from "@/lib/validation";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";

export default function LoginPage() {
  const router = useRouter();
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
      if (res.userType !== "system") {
        setError("This portal is for platform administrators only.");
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
      };
      setAuthToken(res.token, user);
      router.push("/admin");
    } catch (err) {
      if (applyRateLimit(err) && err instanceof ApiError) {
        const wait = err.retryAfterSeconds ?? 30;
        setError(`Too many sign-in attempts. Wait ${wait}s and try again.`);
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
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-2 flex items-center gap-2">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              PharmaCare Admin
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Platform administration portal
          </p>
        </div>

        <Card className="overflow-hidden shadow-xl">
          <CardContent className="p-8">
            <div className="mb-6 space-y-1">
              <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
              <p className="text-sm text-muted-foreground">
                System administrator credentials only.
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
                    placeholder="admin@pharmacy.com"
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
                <p className="text-sm font-medium text-destructive">{error}</p>
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
      </div>
    </div>
  );
}
