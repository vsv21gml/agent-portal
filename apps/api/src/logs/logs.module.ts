import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { AccessLogEntity } from "./entities/access-log.entity";
import { AuditLogEntity } from "./entities/audit-log.entity";
import { LogsController } from "./logs.controller";
import { LogsService } from "./logs.service";

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, AccessLogEntity]), AuthModule],
  controllers: [LogsController],
  providers: [LogsService, PermissionsGuard],
  exports: [LogsService, TypeOrmModule],
})
export class LogsModule {}
