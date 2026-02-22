import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { GitlabModule } from "../gitlab/gitlab.module";
import { LlmModule } from "../llm/llm.module";
import { NotebooksModule } from "../notebooks/notebooks.module";
import { ProjectsModule } from "../projects/projects.module";
import { VectorDbModule } from "../vectordb/vectordb.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [AuthModule, ProjectsModule, NotebooksModule, GitlabModule, LlmModule, VectorDbModule],
  controllers: [AdminController],
  providers: [PermissionsGuard],
})
export class AdminModule {}
