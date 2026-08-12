/**
 * Stage B (Checkpoint B2) — unit tests for `TenantContextInterceptor`.
 * Mocks `ExecutionContext`/`CallHandler` the way Nest interceptor tests
 * conventionally do (no TestingModule bootstrap needed for a single
 * interceptor with one constructor dependency).
 */

import { of } from 'rxjs';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { TenantContextInterceptor } from '../context/tenant-context.interceptor';
import { TenantContextStorage } from '../context/tenant-context-storage';
import type { SessionTenantResolver } from '../resolvers/session-tenant.resolver';
import type { ChainTenantResolver } from '../resolvers/chain-tenant.resolver';

// Stage B (Checkpoint B5) added a second constructor param, chainResolver,
// used only for derived-JWT principals (isWorkstationToken/isCapabilityToken).
// Neither test below exercises that branch, so a bare mock is enough.
function makeChainResolver(): jest.Mocked<ChainTenantResolver> {
  return {
    resolveDefaultTenantIgnoringBranch: jest.fn().mockResolvedValue('chain-resolved-tenant-id'),
  } as unknown as jest.Mocked<ChainTenantResolver>;
}

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeCallHandler(fn: () => unknown) {
  return {
    handle: () => of(fn()),
  } as unknown as CallHandler;
}

describe('TenantContextInterceptor', () => {
  it('establishes TenantContextStorage with the resolved tenant before invoking next.handle()', async () => {
    const resolver = {
      resolve: jest.fn().mockResolvedValue('resolved-tenant-id'),
    } as unknown as jest.Mocked<SessionTenantResolver>;
    const interceptor = new TenantContextInterceptor(resolver, makeChainResolver());

    let observedTenantId: string | null = null;
    const context = makeContext({ tenantId: 'resolved-tenant-id' });
    const handler = makeCallHandler(() => {
      const storage = new TenantContextStorage();
      // Synchronously readable here because intercept() calls
      // TenantContextStorage.run() around the invocation of next.handle().
      observedTenantId = TenantContextStorage.hasContext() ? 'has-context' : null;
      return storage.currentTenantId();
    });

    const observable = await interceptor.intercept(context, handler);
    const result = await new Promise((resolve) => observable.subscribe(resolve));

    expect(resolver.resolve).toHaveBeenCalledWith({ tenantId: 'resolved-tenant-id' });
    expect(observedTenantId).toBe('has-context');
    expect(result).toBe('resolved-tenant-id');
  });

  it('passes a null principal through to the resolver when request.user is absent', async () => {
    const resolver = {
      resolve: jest.fn().mockResolvedValue('default-tenant-id'),
    } as unknown as jest.Mocked<SessionTenantResolver>;
    const interceptor = new TenantContextInterceptor(resolver, makeChainResolver());

    const context = makeContext(undefined);
    const handler = makeCallHandler(() => 'ok');

    await interceptor.intercept(context, handler);

    expect(resolver.resolve).toHaveBeenCalledWith(null);
  });
});
