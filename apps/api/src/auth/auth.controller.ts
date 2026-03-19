import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { GlobalRole } from "../common/enums/global-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { Roles } from "./decorators/roles.decorator";
import { Public } from "./decorators/public.decorator";
import { AuthService } from "./auth.service";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetUserPasswordDto } from "./dto/reset-user-password.dto";
import { SetPasswordDto } from "./dto/set-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Permissions } from "./decorators/permissions.decorator";
import { PermissionsService } from "./permissions.service";
import { JwtPayload } from "./types/jwt-payload.type";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
  ) {}

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
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, this.getClientIp(req));
  }

  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Post("me/password")
  async setMyPassword(@CurrentUser() user: JwtPayload, @Body() dto: SetPasswordDto) {
    await this.authService.setMyPassword(user.sub, dto.password);
    return { success: true };
  }

  @Post("logout")
  async logout(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    await this.authService.logout(user.sub, this.getClientIp(req));
    return { success: true };
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.READ_USER)
  @Get("users")
  users() {
    return this.authService.listUsers();
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.READ_USER)
  @Get("invitations")
  invitations() {
    return this.authService.listInvitations();
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Post("invitations")
  createInvitation(@Body() dto: CreateInvitationDto, @CurrentUser() user: JwtPayload) {
    return this.authService.createInvitation(dto, user.sub);
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Delete("invitations/:invitationId")
  async deleteInvitation(@Param("invitationId") invitationId: string) {
    await this.authService.deleteInvitation(invitationId);
    return { success: true };
  }

  @Public()
  @Get("invitations/:token")
  invitationByToken(@Param("token") token: string) {
    return this.authService.getInvitationByToken(token);
  }

  @Public()
  @Post("invitations/:token/accept")
  acceptInvitation(@Param("token") token: string, @Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(token, dto);
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Post("users/:userId/approve")
  approveUser(@Param("userId") userId: string) {
    return this.authService.approveUser(userId);
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Post("users/:userId/reject")
  rejectUser(@Param("userId") userId: string) {
    return this.authService.rejectUser(userId);
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Patch("users/:userId/role/:role")
  setRole(@Param("userId") userId: string, @Param("role") role: GlobalRole) {
    return this.authService.setGlobalRole(userId, role);
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Patch("users/:userId")
  updateUser(@Param("userId") userId: string, @Body() dto: UpdateUserDto) {
    return this.authService.updateUser(userId, dto);
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Post("users/:userId/reset-password")
  async resetUserPassword(
    @Param("userId") userId: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.resetUserPassword(userId, dto.temporaryPassword, user.sub);
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Delete("users/:userId")
  async deleteUser(@Param("userId") userId: string, @CurrentUser() user: JwtPayload) {
    await this.authService.deleteUser(userId, user.sub);
    return { success: true };
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.READ_USER)
  @Get("role-permissions")
  rolePermissions() {
    return this.permissionsService.listRolePermissions();
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Patch("role-permissions/:role")
  setRolePermissions(@Param("role") role: GlobalRole, @Body() dto: UpdateRolePermissionsDto) {
    return this.permissionsService.setRolePermissions(role, dto.permissions);
  }
}
