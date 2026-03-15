import { Controller, Get } from "@nestjs/common";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { GlobalRole } from "../common/enums/global-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { Roles } from "../auth/decorators/roles.decorator";
import { LogsService } from "./logs.service";

@Controller("admin/logs")
@Roles(GlobalRole.ADMIN)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get("audit")
  @Permissions(Permission.READ_AUDIT_LOG)
  auditLogs() {
    return this.logsService.listAuditLogs();
  }

  @Get("access")
  @Permissions(Permission.READ_ACCESS_LOG)
  accessLogs() {
    return this.logsService.listAccessLogs();
  }
}
