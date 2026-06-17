import { requireServerPermission } from "@/lib/auth-server";

import { PosTerminalActivityClient } from "@/app/(pharmacy)/configuration/pos-terminals/[id]/pos-terminal-activity-client";

export default async function PosTerminalActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireServerPermission("view_pos_terminals");
  const { id } = await params;
  return <PosTerminalActivityClient terminalId={id} />;
}
