export type JournalLinkRow = {
  id: string;
  journalEntryId: string;
  eliminationType: string;
  accountKey: string | null;
  direction: string | null;
  amount: number;
};
