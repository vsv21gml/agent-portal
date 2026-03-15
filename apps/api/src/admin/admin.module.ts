import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LlmModule } from "../llm/llm.module";
import { ProjectEntity } from "../projects/entities/project.entity";
import { ProjectsModule } from "../projects/projects.module";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { VectorDbModule } from "../vectordb/vectordb.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceSessionEntity, ProjectEntity, GitlabRepoEntity, UserEntity]),
    AuthModule,
    ProjectsModule,
    GitlabModule,
    LlmModule,
    VectorDbModule,
  ],
  controllers: [AdminController],
  providers: [PermissionsGuard, AdminService],
})
export class AdminModule {}
