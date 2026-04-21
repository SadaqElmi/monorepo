import { BadRequestException } from '@nestjs/common';

/** Fail fast when amounts imply a journal but no lines were constructed (logic bug). */
export function assertJournalLinesWhenRequired(
  hasEconomicImpact: boolean,
  lineCount: number,
  context: string,
  sourceId: string,
): void {
  if (hasEconomicImpact && lineCount === 0) {
    throw new BadRequestException(
      `${context}: economic amounts require a balanced journal but no lines were built (source ${sourceId})`,
    );
  }
}
