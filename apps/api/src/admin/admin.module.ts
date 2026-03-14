import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LlmModule } from "../llm/llm.module";
import { ProjectsModule } from "../projects/projects.module";
import { VectorDbModule } from "../vectordb/vectordb.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [AuthModule, ProjectsModule, GitlabModule, LlmModule, VectorDbModule],
  controllers: [AdminController],
  providers: [PermissionsGuard],
})
export class AdminModule {}
