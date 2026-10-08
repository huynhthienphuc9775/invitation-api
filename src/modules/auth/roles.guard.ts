import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload, Role } from './jwt.strategy';

export const ROLES_KEY = 'roles';

// Chạy sau JwtAuthGuard: request.user đã là payload đã verify.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    return !!user && roles.includes(user.role);
  }
}
