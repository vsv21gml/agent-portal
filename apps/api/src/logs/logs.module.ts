import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "../auth/entities/user.entity";
import { AccessLogEntity } from "./entities/access-log.entity";
import { AuditLogEntity } from "./entities/audit-log.entity";
import { LogsController } from "./logs.controller";
import { LogsService } from "./logs.service";

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, AccessLogEntity, UserEntity])],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService, TypeOrmModule],
})
export class LogsModule {}
