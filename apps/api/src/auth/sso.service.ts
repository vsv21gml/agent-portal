import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";

@Injectable()
export class SsoService {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  buildOidcLoginUrl(state?: string): string {
    const issuerAuthUrl = this.configService.get<string>("OIDC_AUTHORIZATION_URL");
    const clientId = this.configService.get<string>("OIDC_CLIENT_ID");
    const redirectUri = this.configService.get<string>("OIDC_REDIRECT_URI");
    const scope = this.configService.get<string>("OIDC_SCOPE", "openid profile email");

    if (!issuerAuthUrl || !clientId || !redirectUri) {
      throw new BadRequestException("OIDC is not configured");
    }

    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state: state ?? "agent-portal",
    });
    return `${issuerAuthUrl}?${query.toString()}`;
  }

  async oidcCallback(code: string): Promise<{ accessToken: string }> {
    const tokenUrl = this.configService.get<string>("OIDC_TOKEN_URL");
    const userInfoUrl = this.configService.get<string>("OIDC_USERINFO_URL");
    const clientId = this.configService.get<string>("OIDC_CLIENT_ID");
    const clientSecret = this.configService.get<string>("OIDC_CLIENT_SECRET");
    const redirectUri = this.configService.get<string>("OIDC_REDIRECT_URI");

    if (!tokenUrl || !userInfoUrl || !clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException("OIDC callback settings are incomplete");
    }

    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResp.ok) {
      throw new BadRequestException("OIDC token exchange failed");
    }

    const tokenJson = (await tokenResp.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new BadRequestException("OIDC access token missing");
    }

    const profileResp = await fetch(userInfoUrl, {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileResp.ok) {
      throw new BadRequestException("OIDC user info fetch failed");
    }
    const profile = (await profileResp.json()) as { email?: string; name?: string; preferred_username?: string };
    const email = profile.email ?? profile.preferred_username;
    if (!email) {
      throw new BadRequestException("OIDC profile missing email");
    }

    const user = await this.authService.upsertSsoUser(email, profile.name);
    return this.authService.issueTokenForUser(user);
  }

  async samlAcs(samlResponseBase64: string): Promise<{ accessToken: string }> {
    const xml = Buffer.from(samlResponseBase64, "base64").toString("utf-8");
    const email =
      this.extractMatch(xml, /<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/) ??
      this.extractMatch(xml, /<NameID[^>]*>([^<]+)<\/NameID>/);

    if (!email) {
      throw new BadRequestException("SAML response missing user identifier");
    }

    const user = await this.authService.upsertSsoUser(email, email.split("@")[0]);
    return this.authService.issueTokenForUser(user);
  }

  private extractMatch(input: string, regex: RegExp): string | null {
    const match = input.match(regex);
    return match?.[1] ?? null;
  }
}
