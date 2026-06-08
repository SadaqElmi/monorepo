import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";

export default function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="px-4 pt-3 md:px-8">
          <ReportScopeBadge />
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
