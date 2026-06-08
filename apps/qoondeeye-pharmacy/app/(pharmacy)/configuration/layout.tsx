import type { ReactNode } from "react";

export default function ConfigurationModuleLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-full bg-gradient-to-b from-muted/20 via-background to-background">
      {children}
    </div>
  );
}
