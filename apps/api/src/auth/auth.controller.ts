import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { GlobalRole } from "../common/enums/global-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { Roles } from "./decorators/roles.decorator";
import { Public } from "./decorators/public.decorator";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
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
    return user;
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.READ_USER)
  @Get("users")
  users() {
    return this.authService.listUsers();
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_USER_ROLE)
  @Patch("users/:userId/role/:role")
  setRole(@Param("userId") userId: string, @Param("role") role: GlobalRole) {
    return this.authService.setGlobalRole(userId, role);
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
