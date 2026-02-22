import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission } from "../../common/enums/permission.enum";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { PermissionsService } from "../permissions.service";
import { JwtPayload } from "../types/jwt-payload.type";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!request.user) {
      throw new ForbiddenException("Authentication required");
    }

    const allowed = await this.permissionsService.hasPermissions(request.user.role, requiredPermissions);
    if (!allowed) {
      throw new ForbiddenException(`Missing permissions: ${requiredPermissions.join(", ")}`);
    }
    return true;
  }
}
