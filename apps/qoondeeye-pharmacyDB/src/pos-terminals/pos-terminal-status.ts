export const POS_TERMINAL_STATUSES = ['active', 'inactive'] as const;
export type PosTerminalStatus = (typeof POS_TERMINAL_STATUSES)[number];

export const POS_TERMINAL_BINDING_STATUSES = [
  'unbound',
  'bound',
  'revoked',
] as const;
export type PosTerminalBindingStatus =
  (typeof POS_TERMINAL_BINDING_STATUSES)[number];

export function isPosTerminalStatus(value: string): value is PosTerminalStatus {
  return (POS_TERMINAL_STATUSES as readonly string[]).includes(value);
}

export function isPosTerminalBindingStatus(
  value: string,
): value is PosTerminalBindingStatus {
  return (POS_TERMINAL_BINDING_STATUSES as readonly string[]).includes(value);
}
