import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LlmModule } from "../llm/llm.module";
import { ProjectMemberEntity } from "./entities/project-member.entity";
import { ProjectResourceLimitEntity } from "./entities/project-resource-limit.entity";
import { ProjectEntity } from "./entities/project.entity";
import { ProjectManagerGuard } from "./guards/project-manager.guard";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, ProjectMemberEntity, ProjectResourceLimitEntity]),
    AuthModule,
    GitlabModule,
    LlmModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectManagerGuard],
  exports: [ProjectsService, TypeOrmModule],
})
export class ProjectsModule {}
