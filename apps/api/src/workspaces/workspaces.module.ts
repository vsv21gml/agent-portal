import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LlmModule } from "../llm/llm.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GitlabModule } from "../gitlab/gitlab.module";
import { ProjectsModule } from "../projects/projects.module";
import { WorkspaceSessionEntity } from "./entities/workspace-session.entity";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceSessionEntity]), ProjectsModule, GitlabModule, AuthModule, LlmModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService, TypeOrmModule],
})
export class WorkspacesModule {}
