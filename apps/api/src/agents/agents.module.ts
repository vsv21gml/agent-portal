import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LlmModule } from "../llm/llm.module";
import { LiteLlmModelAccessRequestEntity } from "../llm/entities/litellm-model-access-request.entity";
import { ProjectsModule } from "../projects/projects.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { AgentDeploymentEntity } from "./entities/agent-deployment.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AgentDeploymentEntity, LiteLlmModelAccessRequestEntity]), ProjectsModule, GitlabModule, AuthModule, LlmModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService, TypeOrmModule],
})
export class AgentsModule {}
