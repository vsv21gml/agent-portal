import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GlobalRole } from "../../common/enums/global-role.enum";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { JwtPayload } from "../types/jwt-payload.type";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<GlobalRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!request.user || !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
