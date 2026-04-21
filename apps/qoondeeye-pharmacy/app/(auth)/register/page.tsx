"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Registration is admin-only. Creating a pharmacy or user is done from
 * Admin → Staff ("New pharmacy"). This page redirects to login so users
 * only see the login page.
 */
export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
    </div>
  );
}
