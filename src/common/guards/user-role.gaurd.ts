import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../interfaces';
import { CustomForbiddenException } from '../execeptions';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const requireRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requireRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    // const isAuthorize = requireRoles.includes(user.role);
    const isAuthorize = requireRoles.some((role: UserRole) => {
      console.log(user.role);
      return user.role?.includes(role);
    });

    if (!isAuthorize) {
      throw new CustomForbiddenException('Un-Authorize User');
    }

    return true;
  }
}
