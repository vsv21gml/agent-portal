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
import { GitlabModule } from "./gitlab/gitlab.module";
import { GitlabGroupEntity } from "./gitlab/entities/gitlab-group.entity";
import { GitlabMemberSyncEntity } from "./gitlab/entities/gitlab-member-sync.entity";
import { GitlabRepoEntity } from "./gitlab/entities/gitlab-repo.entity";
import { LlmModule } from "./llm/llm.module";
import { LiteLlmKeyEntity } from "./llm/entities/litellm-key.entity";
import { LiteLlmModelEntity } from "./llm/entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "./llm/entities/litellm-team.entity";
import { LoggingMiddleware } from "./logs/logging.middleware";
import { LogsModule } from "./logs/logs.module";
import { NotebookSessionEntity } from "./notebooks/entities/notebook-session.entity";
import { NotebooksModule } from "./notebooks/notebooks.module";
import { ProjectMemberEntity } from "./projects/entities/project-member.entity";
import { ProjectResourceLimitEntity } from "./projects/entities/project-resource-limit.entity";
import { ProjectEntity } from "./projects/entities/project.entity";
import { ProjectsModule } from "./projects/projects.module";
import { VectorKeyEntity } from "./vectordb/entities/vector-key.entity";
import { VectorDbModule } from "./vectordb/vectordb.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "sqlite",
        database: configService.get<string>("DATABASE_PATH", "dev.sqlite"),
        synchronize: configService.get<string>("TYPEORM_SYNC", "true") === "true",
        entities: [
          UserEntity,
          RolePermissionEntity,
          ProjectEntity,
          ProjectMemberEntity,
          ProjectResourceLimitEntity,
          NotebookSessionEntity,
          GitlabGroupEntity,
          GitlabRepoEntity,
          GitlabMemberSyncEntity,
          LiteLlmTeamEntity,
          LiteLlmKeyEntity,
          LiteLlmModelEntity,
          VectorKeyEntity,
        ],
      }),
    }),
    AuthModule,
    ProjectsModule,
    NotebooksModule,
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
