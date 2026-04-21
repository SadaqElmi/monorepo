import { Injectable } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<{
    tenant: Tenant | null;
    isSystem: boolean;
  }>();

  // Fallback for code paths outside a request context (e.g. startup scripts).
  private fallbackTenant: Tenant | null = null;
  private fallbackIsSystem = false;

  runWithContext<T>(
    fn: () => T,
    initial: { tenant: Tenant | null; isSystem: boolean } = {
      tenant: null,
      isSystem: false,
    },
  ): T {
    return this.als.run(initial, fn);
  }

  private get store() {
    return this.als.getStore();
  }

  setTenant(tenant: Tenant | null) {
    const store = this.store;
    if (store) {
      store.tenant = tenant;
      store.isSystem = false;
      return;
    }
    this.fallbackTenant = tenant;
    this.fallbackIsSystem = false;
  }

  getTenant(): Tenant | null {
    return this.store?.tenant ?? this.fallbackTenant;
  }

  getSchemaName(): string | null {
    return this.getTenant()?.schemaName ?? null;
  }

  setSystem(isSystem = true) {
    const store = this.store;
    if (store) {
      store.isSystem = isSystem;
      store.tenant = null;
      return;
    }
    this.fallbackIsSystem = isSystem;
    this.fallbackTenant = null;
  }

  isSystem(): boolean {
    return this.store?.isSystem ?? this.fallbackIsSystem;
  }

  clear() {
    const store = this.store;
    if (store) {
      store.tenant = null;
      store.isSystem = false;
      return;
    }
    this.fallbackTenant = null;
    this.fallbackIsSystem = false;
  }
}
