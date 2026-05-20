import { Loader2 } from "lucide-react";

type RouteLoadingProps = {
  variant?: "route" | "section";
};

export function RouteLoading({ variant = "route" }: RouteLoadingProps) {
  const className =
    variant === "route"
      ? "flex min-h-dvh items-center justify-center"
      : "flex min-h-[50vh] items-center justify-center p-4 md:p-6";

  return (
    <div
      className={className}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}
