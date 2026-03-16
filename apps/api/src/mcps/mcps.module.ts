import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LlmModule } from "../llm/llm.module";
import { LiteLlmModelAccessRequestEntity } from "../llm/entities/litellm-model-access-request.entity";
import { LogsModule } from "../logs/logs.module";
import { ProjectsModule } from "../projects/projects.module";
import { McpsController } from "./mcps.controller";
import { McpsService } from "./mcps.service";
import { McpDeploymentEntity } from "./entities/mcp-deployment.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([McpDeploymentEntity, LiteLlmModelAccessRequestEntity]),
    ProjectsModule,
    GitlabModule,
    AuthModule,
    LlmModule,
    LogsModule,
  ],
  controllers: [McpsController],
  providers: [McpsService],
  exports: [McpsService, TypeOrmModule],
})
export class McpsModule {}
