import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { JwtPayload } from "../types/jwt-payload.type";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload | null => {
  const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
  return request.user ?? null;
});
