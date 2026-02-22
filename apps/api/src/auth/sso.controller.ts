import { Body, Controller, Get, Post, Query, Redirect } from "@nestjs/common";
import { Public } from "./decorators/public.decorator";
import { SsoService } from "./sso.service";

@Controller("auth/sso")
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  @Public()
  @Get("oidc/login")
  @Redirect()
  oidcLogin(@Query("state") state?: string) {
    return { url: this.ssoService.buildOidcLoginUrl(state) };
  }

  @Public()
  @Get("oidc/callback")
  oidcCallback(@Query("code") code: string) {
    return this.ssoService.oidcCallback(code);
  }

  @Public()
  @Post("saml/acs")
  samlAcs(@Body("SAMLResponse") samlResponse: string) {
    return this.ssoService.samlAcs(samlResponse);
  }
}
