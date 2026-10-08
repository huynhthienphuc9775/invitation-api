import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Role } from './jwt.strategy';
import { ROLES_KEY, RolesGuard } from './roles.guard';

// Bắt buộc JWT hợp lệ VÀ role nằm trong danh sách. Token cũ không có `role` sẽ bị chặn.
export const Auth = (...roles: Role[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, RolesGuard),
  );
