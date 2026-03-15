import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "./auth/guards/permissions.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { AuthModule } from "./auth/auth.module";
import { RolePermissionEntity } from "./auth/entities/role-permission.entity";
import { UserEntity } from "./auth/entities/user.entity";
import { UserInvitationEntity } from "./auth/entities/user-invitation.entity";
import { GitlabModule } from "./gitlab/gitlab.module";
import { GitlabGroupEntity } from "./gitlab/entities/gitlab-group.entity";
import { GitlabMemberSyncEntity } from "./gitlab/entities/gitlab-member-sync.entity";
import { GitlabRepoEntity } from "./gitlab/entities/gitlab-repo.entity";
import { LlmModule } from "./llm/llm.module";
import { LiteLlmKeyEntity } from "./llm/entities/litellm-key.entity";
import { LiteLlmCatalogModelEntity } from "./llm/entities/litellm-catalog-model.entity";
import { LiteLlmModelAccessRequestEntity } from "./llm/entities/litellm-model-access-request.entity";
import { LiteLlmModelEntity } from "./llm/entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "./llm/entities/litellm-team.entity";
import { LiteLlmUserKeyEntity } from "./llm/entities/litellm-user-key.entity";
import { LoggingMiddleware } from "./logs/logging.middleware";
import { LogsModule } from "./logs/logs.module";
import { AccessLogEntity } from "./logs/entities/access-log.entity";
import { AuditLogEntity } from "./logs/entities/audit-log.entity";
import { ProjectMemberEntity } from "./projects/entities/project-member.entity";
import { ProjectResourceLimitEntity } from "./projects/entities/project-resource-limit.entity";
import { ProjectEntity } from "./projects/entities/project.entity";
import { ProjectsModule } from "./projects/projects.module";
import { VectorKeyEntity } from "./vectordb/entities/vector-key.entity";
import { VectorDbModule } from "./vectordb/vectordb.module";
import { WorkspaceSessionEntity } from "./workspaces/entities/workspace-session.entity";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get<string>("DB_HOST", "localhost"),
        port: Number(configService.get<string>("DB_PORT", "5432")),
        username: configService.get<string>("DB_USER", "postgres"),
        password: configService.get<string>("DB_PASSWORD", "postgres"),
        database: configService.get<string>("DB_NAME", "agent_portal"),
        ssl: configService.get<string>("DB_SSL", "false") === "true" ? { rejectUnauthorized: false } : undefined,
        synchronize: configService.get<string>("TYPEORM_SYNC", "true") === "true",
        entities: [
          UserEntity,
          UserInvitationEntity,
          RolePermissionEntity,
          ProjectEntity,
          ProjectMemberEntity,
          ProjectResourceLimitEntity,
          WorkspaceSessionEntity,
          GitlabGroupEntity,
          GitlabRepoEntity,
          GitlabMemberSyncEntity,
          LiteLlmTeamEntity,
          LiteLlmKeyEntity,
          LiteLlmModelEntity,
          LiteLlmCatalogModelEntity,
          LiteLlmModelAccessRequestEntity,
          LiteLlmUserKeyEntity,
          VectorKeyEntity,
          AuditLogEntity,
          AccessLogEntity,
        ],
      }),
    }),
    AuthModule,
    ProjectsModule,
    WorkspacesModule,
    GitlabModule,
    LlmModule,
    LogsModule,
    AdminModule,
    VectorDbModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes("*");
  }
}
