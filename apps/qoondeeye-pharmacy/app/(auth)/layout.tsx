import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Layout for auth routes like /login.
  return <>{children}</>;
}

