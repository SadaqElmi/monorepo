/** PostgreSQL undefined_table (42P01) from Prisma/pg driver errors. */
export function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code === '42P01') return true;
  const message = String((err as { message?: string }).message ?? err);
  return /relation .* does not exist/i.test(message);
}
