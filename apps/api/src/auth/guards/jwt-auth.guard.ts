import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { GlobalRole } from "../../common/enums/global-role.enum";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { JwtPayload } from "../types/jwt-payload.type";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (process.env.AUTH_BYPASS === "true") {
      request.user = {
        sub: process.env.AUTH_BYPASS_USER_ID ?? "dev-user-id",
        email: process.env.AUTH_BYPASS_EMAIL ?? "dev@example.com",
        role: (process.env.AUTH_BYPASS_ROLE as GlobalRole) ?? GlobalRole.ADMIN,
      };
      return true;
    }

    return super.canActivate(context);
  }
}
