import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type MetricOutcome = 'success' | 'failure' | 'replay' | 'conflict';

@Injectable()
export class OpsMonitoringService {
  private readonly logger = new Logger(OpsMonitoringService.name);
  private readonly ensuredSchemas = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTable(schemaName: string): Promise<void> {
    if (this.ensuredSchemas.has(schemaName)) return;
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ops_metric_counters" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
        metric_key VARCHAR(100) NOT NULL,
        outcome VARCHAR(20) NOT NULL,
        metric_count INTEGER NOT NULL DEFAULT 0,
        last_payload JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(metric_date, metric_key, outcome)
      )`,
    );
    this.ensuredSchemas.add(schemaName);
  }

  async increment(
    schemaName: string,
    metricKey: string,
    outcome: MetricOutcome,
    payload?: Record<string, unknown> | null,
  ): Promise<void> {
    await this.ensureTable(schemaName);
    await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO ops_metric_counters (metric_date, metric_key, outcome, metric_count, last_payload, updated_at)
         VALUES (CURRENT_DATE, $1, $2, 1, $3::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (metric_date, metric_key, outcome)
         DO UPDATE SET
           metric_count = ops_metric_counters.metric_count + 1,
           last_payload = EXCLUDED.last_payload,
           updated_at = CURRENT_TIMESTAMP`,
        metricKey,
        outcome,
        JSON.stringify(payload ?? null),
      ),
    );
    this.logger.log(
      JSON.stringify({
        kind: 'ops_metric',
        schema: schemaName,
        metricKey,
        outcome,
      }),
    );
  }
}
