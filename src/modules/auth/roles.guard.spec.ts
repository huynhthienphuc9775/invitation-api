import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from './jwt.strategy';

describe('RolesGuard', () => {
  const contextFor = (user?: { role?: Role }): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const guardRequiring = (roles?: Role[]) =>
    new RolesGuard({
      getAllAndOverride: () => roles,
    } as unknown as Reflector);

  it('lets an admin token through an admin route', () => {
    expect(
      guardRequiring(['admin']).canActivate(contextFor({ role: 'admin' })),
    ).toBe(true);
  });

  it('blocks a customer token on an admin route', () => {
    expect(
      guardRequiring(['admin']).canActivate(contextFor({ role: 'customer' })),
    ).toBe(false);
  });

  it('blocks a legacy token without a role', () => {
    expect(guardRequiring(['admin']).canActivate(contextFor({}))).toBe(false);
  });

  it('allows any authenticated user when no role is required', () => {
    expect(guardRequiring().canActivate(contextFor({ role: 'customer' }))).toBe(
      true,
    );
  });
});
