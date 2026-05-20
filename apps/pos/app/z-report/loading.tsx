import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-4 p-4" aria-busy="true" aria-label="Loading Z-Report">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full max-w-lg rounded-lg" />
    </section>
  );
}
