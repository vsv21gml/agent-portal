import { Body, Controller, Get, Post, Query, Redirect, Req } from "@nestjs/common";
import { Request } from "express";
import { Public } from "./decorators/public.decorator";
import { SsoService } from "./sso.service";

@Controller("auth/sso")
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  private getClientIp(req: Request): string | null {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string") {
      return forwardedFor.split(",")[0].trim();
    }
    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0]?.split(",")[0].trim() ?? null;
    }
    return req.ip ?? null;
  }

  @Public()
  @Get("oidc/login")
  @Redirect()
  oidcLogin(@Query("state") state?: string) {
    return { url: this.ssoService.buildOidcLoginUrl(state) };
  }

  @Public()
  @Get("oidc/callback")
  oidcCallback(@Query("code") code: string, @Req() req: Request) {
    return this.ssoService.oidcCallback(code, this.getClientIp(req));
  }

  @Public()
  @Post("saml/acs")
  samlAcs(@Body("SAMLResponse") samlResponse: string, @Req() req: Request) {
    return this.ssoService.samlAcs(samlResponse, this.getClientIp(req));
  }
}
