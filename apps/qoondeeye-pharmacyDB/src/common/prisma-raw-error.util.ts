export function isRawQueryUniqueMessage(message: string): boolean {
  return (
    /duplicate key value violates unique constraint/i.test(message) ||
    /\b23505\b/.test(message) ||
    /unique constraint failed/i.test(message)
  );
}

export function isPrismaRawUniqueViolation(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    meta?: { code?: string; constraint?: string; target?: unknown };
    message?: string;
  };
  if (candidate?.code === 'P2002') return true;
  if (candidate?.meta?.code === '23505') return true;
  const message = error instanceof Error ? error.message : String(error);
  return isRawQueryUniqueMessage(message);
}
