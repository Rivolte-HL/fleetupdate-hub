import { HostType } from '@prisma/client';
import { BaseServiceAdapter } from './base.adapter.js';
import { AdapterMetadata } from '../types/adapter.types.js';

export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private adapters = new Map<string, BaseServiceAdapter>();

  private constructor() {}

  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Registers a service adapter
   */
  public registerAdapter(adapter: BaseServiceAdapter): void {
    const meta = adapter.getMetadata();
    const typeKey = meta.type.toUpperCase();
    this.adapters.set(typeKey, adapter);
    console.log(`[ServiceRegistry] Registered adapter for type: ${typeKey} (${meta.displayName})`);
  }

  /**
   * Retrieves an adapter by HostType
   */
  public getAdapter(type: HostType | string): BaseServiceAdapter {
    const key = type.toUpperCase();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`[ServiceRegistry] No registered adapter found for type '${type}'. Available: ${Array.from(this.adapters.keys()).join(', ')}`);
    }
    return adapter;
  }

  /**
   * Returns metadata for all registered adapters
   */
  public getAllMetadata(): AdapterMetadata[] {
    return Array.from(this.adapters.values()).map((adapter) => adapter.getMetadata());
  }

  /**
   * Checks if an adapter is registered
   */
  public hasAdapter(type: HostType | string): boolean {
    return this.adapters.has(type.toUpperCase());
  }
}
