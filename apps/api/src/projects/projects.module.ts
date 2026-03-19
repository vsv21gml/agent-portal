import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { UserEntity } from "../auth/entities/user.entity";
import { GitlabGroupEntity } from "../gitlab/entities/gitlab-group.entity";
import { GitlabMemberSyncEntity } from "../gitlab/entities/gitlab-member-sync.entity";
import { GitlabRepoEntity } from "../gitlab/entities/gitlab-repo.entity";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LiteLlmKeyEntity } from "../llm/entities/litellm-key.entity";
import { LiteLlmModelEntity } from "../llm/entities/litellm-model.entity";
import { LiteLlmTeamEntity } from "../llm/entities/litellm-team.entity";
import { LlmModule } from "../llm/llm.module";
import { LogsModule } from "../logs/logs.module";
import { AgentDeploymentEntity } from "../agents/entities/agent-deployment.entity";
import { McpDeploymentEntity } from "../mcps/entities/mcp-deployment.entity";
import { WorkspaceSessionEntity } from "../workspaces/entities/workspace-session.entity";
import { VectorKeyEntity } from "../vectordb/entities/vector-key.entity";
import { ProjectEndpointEntity } from "./entities/project-endpoint.entity";
import { ProjectMemberEntity } from "./entities/project-member.entity";
import { ProjectResourceLimitEntity } from "./entities/project-resource-limit.entity";
import { ProjectEntity } from "./entities/project.entity";
import { ProjectManagerGuard } from "./guards/project-manager.guard";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      ProjectMemberEntity,
      ProjectResourceLimitEntity,
      UserEntity,
      GitlabGroupEntity,
      GitlabRepoEntity,
      GitlabMemberSyncEntity,
      LiteLlmTeamEntity,
      LiteLlmKeyEntity,
      LiteLlmModelEntity,
      VectorKeyEntity,
      WorkspaceSessionEntity,
      AgentDeploymentEntity,
      McpDeploymentEntity,
      ProjectEndpointEntity,
    ]),
    AuthModule,
    GitlabModule,
    LlmModule,
    LogsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectManagerGuard],
  exports: [ProjectsService, TypeOrmModule],
})
export class ProjectsModule {}
