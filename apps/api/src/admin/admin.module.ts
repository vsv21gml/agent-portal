import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { AgentDeploymentEntity } from "../agents/entities/agent-deployment.entity";
import { AgentsModule } from "../agents/agents.module";
import { McpDeploymentEntity } from "../mcps/entities/mcp-deployment.entity";
import { McpsModule } from "../mcps/mcps.module";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LlmModule } from "../llm/llm.module";
import { ProjectEntity } from "../projects/entities/project.entity";
import { ProjectsModule } from "../projects/projects.module";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { VectorDbModule } from "../vectordb/vectordb.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { ManagedNodeGroupScheduleEntity } from "./entities/managed-nodegroup-schedule.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceSessionEntity,
      AgentDeploymentEntity,
      McpDeploymentEntity,
      ProjectEntity,
      GitlabRepoEntity,
      UserEntity,
      ManagedNodeGroupScheduleEntity,
    ]),
    AuthModule,
    ProjectsModule,
    WorkspacesModule,
    AgentsModule,
    McpsModule,
    GitlabModule,
    LlmModule,
    VectorDbModule,
  ],
  controllers: [AdminController],
  providers: [PermissionsGuard, AdminService],
})
export class AdminModule {}
