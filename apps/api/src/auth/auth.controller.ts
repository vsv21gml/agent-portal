import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { GlobalRole } from "../common/enums/global-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { Roles } from "./decorators/roles.decorator";
import { Public } from "./decorators/public.decorator";
import { AuthService } from "./auth.service";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
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

  @Public()
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
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
