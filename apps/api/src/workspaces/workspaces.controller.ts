import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceRuntimeDto } from "./dto/update-workspace-runtime.dto";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  createWorkspace(@Body() dto: CreateWorkspaceDto, @CurrentUser() user: JwtPayload) {
    return this.workspacesService.createWorkspace(dto, user.sub);
  }

  @Get("project/:projectId")
  listByProject(@Param("projectId") projectId: string, @CurrentUser() user: JwtPayload) {
    return this.workspacesService.listByProject(projectId, user.sub);
  }

  @Get(":workspaceId")
  getWorkspace(@Param("workspaceId") workspaceId: string, @CurrentUser() user: JwtPayload) {
    return this.workspacesService.getWorkspace(workspaceId, user.sub);
  }

  @Patch(":workspaceId")
  updateWorkspaceRuntime(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: UpdateWorkspaceRuntimeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workspacesService.updateWorkspaceRuntime(workspaceId, user.sub, dto.runtime);
  }

  @Delete(":workspaceId")
  deleteWorkspace(@Param("workspaceId") workspaceId: string, @CurrentUser() user: JwtPayload) {
    return this.workspacesService.deleteWorkspace(workspaceId, user.sub);
  }
}
