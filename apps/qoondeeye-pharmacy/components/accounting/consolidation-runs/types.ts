import type { ConsolidationRunItem } from "@/lib/services/accounting";

export type ConsolidationRunDetailSelected = ConsolidationRunItem & {
  events: Array<{
    id: string;
    eventType: string;
    actorUserId: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }>;
  journalLinks: Array<{
    id: string;
    journalEntryId: string;
    eliminationType: string;
    accountKey: string | null;
    direction: string | null;
    amount: number;
  }>;
  explain: Record<string, unknown>;
};
