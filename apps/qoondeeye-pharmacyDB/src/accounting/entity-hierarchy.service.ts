import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EntitySummary = {
  id: string;
  name: string;
  code: string;
  parentEntityId: string | null;
  branchCount: number;
};

export type EntityScopeResolution = {
  entityId: string;
  descendantEntityIds: string[];
  branchIds: string[];
  branchOwnership: Record<string, number>;
  entityOwnership: Record<string, number>;
  descendantCount: number;
  branchCount: number;
};

@Injectable()
export class EntityHierarchyService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureEnabled() {
    const raw = (process.env.CONSOLIDATION_ENTITY_SCOPE_V1 ?? '')
      .trim()
      .toLowerCase();
    if (!['1', 'true', 'yes', 'on'].includes(raw)) {
      throw new BadRequestException(
        'Entity scope is disabled by CONSOLIDATION_ENTITY_SCOPE_V1',
      );
    }
  }

  private partialOwnershipEnabled(): boolean {
    const raw = (process.env.CONSOLIDATION_PARTIAL_OWNERSHIP_V1 ?? '')
      .trim()
      .toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }

  async listEntities(schemaName: string): Promise<EntitySummary[]> {
    this.ensureEnabled();
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          code: string;
          parent_entity_id: string | null;
          branch_count: number;
        }>
      >(
        `SELECT e.id::text,
                e.name,
                e.code,
                e.parent_entity_id::text,
                COUNT(eb.branch_id)::int AS branch_count
         FROM entities e
         LEFT JOIN entity_branches eb ON eb.entity_id = e.id
         WHERE e.is_active = true
         GROUP BY e.id, e.name, e.code, e.parent_entity_id
         ORDER BY e.code ASC`,
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        parentEntityId: row.parent_entity_id,
        branchCount: Number(row.branch_count ?? 0),
      }));
    });
  }

  async resolveScopeByEntity(
    schemaName: string,
    entityId: string,
    asOfDate?: string,
  ): Promise<EntityScopeResolution> {
    this.ensureEnabled();
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return this.resolveScopeByEntityInTx(tx, entityId, asOfDate);
    });
  }

  async resolveScopeByEntityInTx(
    tx: Prisma.TransactionClient,
    entityId: string,
    asOfDate?: string,
  ): Promise<EntityScopeResolution> {
    const [entity] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text
       FROM entities
       WHERE id = $1::uuid
         AND is_active = true
       LIMIT 1`,
      entityId,
    );
    if (!entity?.id) {
      throw new NotFoundException('Entity not found for consolidation scope');
    }

    const edges = await tx.$queryRawUnsafe<
      Array<{
        parent_entity_id: string;
        child_entity_id: string;
        ownership_percent: string;
      }>
    >(
      `SELECT parent_entity_id::text,
              child_entity_id::text,
              ownership_percent::text
       FROM entity_ownership
       WHERE is_active = true
         AND ($1::date IS NULL OR effective_from <= $1::date)
         AND ($1::date IS NULL OR effective_to IS NULL OR effective_to >= $1::date)`,
      asOfDate?.trim() || null,
    );

    const children = new Map<string, string[]>();
    const edgeOwnership = new Map<string, number>();
    const allowPartial = this.partialOwnershipEnabled();
    for (const edge of edges) {
      const ownership = Number(edge.ownership_percent);
      if (ownership <= 0 || ownership > 100) {
        throw new BadRequestException(
          'Invalid entity ownership percent range (must be > 0 and <= 100).',
        );
      }
      if (!allowPartial && Math.abs(ownership - 100) > 0.0001) {
        throw new BadRequestException(
          'Partial ownership requires CONSOLIDATION_PARTIAL_OWNERSHIP_V1=true',
        );
      }
      const list = children.get(edge.parent_entity_id) ?? [];
      list.push(edge.child_entity_id);
      children.set(edge.parent_entity_id, list);
      edgeOwnership.set(
        `${edge.parent_entity_id}:${edge.child_entity_id}`,
        ownership / 100,
      );
    }

    const visited = new Set<string>();
    const stack = new Set<string>();
    const descendants: string[] = [];
    const weights = new Map<string, number>();
    const dfs = (node: string) => {
      if (stack.has(node)) {
        throw new BadRequestException(
          'Invalid entity hierarchy: ownership cycle detected.',
        );
      }
      if (visited.has(node)) return;
      visited.add(node);
      stack.add(node);
      descendants.push(node);
      for (const child of children.get(node) ?? []) {
        const parentW = weights.get(node) ?? 1;
        const edgeW = edgeOwnership.get(`${node}:${child}`) ?? 1;
        weights.set(child, parentW * edgeW);
        dfs(child);
      }
      stack.delete(node);
    };
    weights.set(entityId, 1);
    dfs(entityId);

    const branchRows = await tx.$queryRawUnsafe<Array<{ branch_id: string }>>(
      `SELECT DISTINCT eb.branch_id::text AS branch_id
       FROM entity_branches eb
       WHERE eb.entity_id = ANY($1::uuid[])
       ORDER BY eb.branch_id::text ASC`,
      descendants,
    );
    const branchIds = branchRows.map((row) => row.branch_id).filter(Boolean);
    const branchOwnershipRows = await tx.$queryRawUnsafe<
      Array<{ branch_id: string; entity_id: string }>
    >(
      `SELECT eb.branch_id::text AS branch_id,
              eb.entity_id::text AS entity_id
       FROM entity_branches eb
       WHERE eb.entity_id = ANY($1::uuid[])`,
      descendants,
    );
    const branchOwnership: Record<string, number> = {};
    for (const row of branchOwnershipRows) {
      const w = weights.get(row.entity_id) ?? 1;
      if (branchOwnership[row.branch_id] == null) {
        branchOwnership[row.branch_id] = w;
      } else {
        branchOwnership[row.branch_id] = Math.min(
          branchOwnership[row.branch_id],
          w,
        );
      }
    }
    const entityOwnership: Record<string, number> = {};
    for (const [k, v] of weights.entries()) {
      entityOwnership[k] = v;
    }
    return {
      entityId,
      descendantEntityIds: descendants.sort(),
      branchIds: [...new Set(branchIds)].sort(),
      branchOwnership,
      entityOwnership,
      descendantCount: descendants.length,
      branchCount: branchIds.length,
    };
  }
}
