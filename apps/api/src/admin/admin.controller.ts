import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuthService } from "../auth/auth.service";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { GlobalRole } from "../common/enums/global-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { GitlabService } from "../gitlab/gitlab.service";
import { ReviewModelAccessRequestDto } from "../llm/dto/review-model-access-request.dto";
import { SetDefaultModelDto } from "../llm/dto/set-default-model.dto";
import { LlmService } from "../llm/llm.service";
import { AddProjectMemberDto } from "../projects/dto/add-project-member.dto";
import { ProjectsService } from "../projects/projects.service";
import { VectorDbService } from "../vectordb/vectordb.service";
import { AdminService } from "./admin.service";

@Controller("admin")
@Roles(GlobalRole.ADMIN)
@UseGuards(PermissionsGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
    private readonly gitlabService: GitlabService,
    private readonly llmService: LlmService,
    private readonly vectorDbService: VectorDbService,
  ) {}

  @Get("users")
  @Permissions(Permission.READ_USER)
  users() {
    return this.adminService.listUsers();
  }

  @Get("projects")
  @Permissions(Permission.READ_PROJECT)
  projects() {
    return this.adminService.listProjects();
  }

  @Get("projects/:projectId/overview")
  @Permissions(Permission.READ_PROJECT)
  projectOverview(@Param("projectId") projectId: string) {
    return this.projectsService.getOverview(projectId);
  }

  @Get("projects/:projectId/available-users")
  @Permissions(Permission.READ_PROJECT)
  projectAvailableUsers(@Param("projectId") projectId: string) {
    return this.projectsService.listAvailableUsers(projectId);
  }

  @Post("projects/:projectId/members")
  @Permissions(Permission.WRITE_PROJECT)
  async addProjectMember(
    @Param("projectId") projectId: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    const member = await this.projectsService.addMember(projectId, dto, actor.sub);
    const targetUser = await this.authService.findById(dto.userId);
    await this.gitlabService.syncMemberAccess(projectId, dto.userId, dto.role, targetUser?.email);
    return member;
  }

  @Delete("projects/:projectId/members/:userId")
  @Permissions(Permission.WRITE_PROJECT)
  async removeProjectMember(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    const targetUser = await this.authService.findById(userId);
    await this.projectsService.removeMember(projectId, userId, actor.sub);
    await this.gitlabService.removeMemberAccess(projectId, userId, targetUser?.email);
    return { success: true };
  }

  @Delete("projects/:projectId")
  @Permissions(Permission.WRITE_PROJECT)
  async deleteProject(@Param("projectId") projectId: string, @CurrentUser() actor: JwtPayload) {
    await this.projectsService.deleteProject(projectId, actor.sub);
    return { success: true };
  }

  @Post("projects/:projectId/restore")
  @Permissions(Permission.WRITE_PROJECT)
  restoreProject(@Param("projectId") projectId: string, @CurrentUser() actor: JwtPayload) {
    return this.projectsService.restoreProject(projectId, actor.sub);
  }

  @Get("agents")
  @Permissions(Permission.READ_PROJECT)
  agents() {
    return this.adminService.listAgents();
  }

  @Get("mcps")
  @Permissions(Permission.READ_PROJECT)
  mcps() {
    return this.adminService.listMcps();
  }

  @Get("projects/:projectId/resource-limit")
  @Permissions(Permission.READ_RESOURCE)
  resourceLimit(@Param("projectId") projectId: string) {
    return this.projectsService.getResourceLimit(projectId);
  }

  @Get("projects/:projectId/resource-status")
  @Permissions(Permission.READ_RESOURCE)
  async resourceStatus(@Param("projectId") projectId: string) {
    const limit = await this.projectsService.getResourceLimit(projectId);
    const usage = { usedCpu: 0, usedMemoryGi: 0 };
    return { limit, usage };
  }

  @Get("resources/workspaces")
  @Permissions(Permission.READ_RESOURCE)
  workspaceResources() {
    return this.adminService.getWorkspaceResourceOverview();
  }

  @Get("resources/agents")
  @Permissions(Permission.READ_RESOURCE)
  agentResources() {
    return this.adminService.getAgentResourceOverview();
  }

  @Get("resources/mcps")
  @Permissions(Permission.READ_RESOURCE)
  mcpResources() {
    return this.adminService.getMcpResourceOverview();
  }

  @Get("gitlab/groups")
  @Permissions(Permission.READ_GITLAB)
  groups() {
    return this.gitlabService.listGroups();
  }

  @Get("projects/:projectId/gitlab/repos")
  @Permissions(Permission.READ_GITLAB)
  repos(@Param("projectId") projectId: string) {
    return this.gitlabService.listRepos(projectId);
  }

  @Get("projects/:projectId/gitlab/member-sync")
  @Permissions(Permission.READ_GITLAB)
  memberSync(@Param("projectId") projectId: string) {
    return this.gitlabService.listMemberSync(projectId);
  }

  @Get("projects/:projectId/llm/models")
  @Permissions(Permission.READ_LLM)
  models(@Param("projectId") projectId: string) {
    return this.llmService.listAvailableModels(projectId);
  }

  @Get("llm/models")
  @Permissions(Permission.READ_LLM)
  catalogModels() {
    return this.llmService.listCatalogModels();
  }

  @Patch("llm/models/:modelName/default")
  @Permissions(Permission.WRITE_LLM)
  setDefaultModel(@Param("modelName") modelName: string, @Body() dto: SetDefaultModelDto) {
    return this.llmService.setDefaultModel(decodeURIComponent(modelName), dto.isDefault);
  }

  @Get("llm/model-requests")
  @Permissions(Permission.READ_LLM)
  modelAccessRequests() {
    return this.llmService.listModelAccessRequestsForAdmin();
  }

  @Post("llm/model-requests/:requestId/approve")
  @Permissions(Permission.WRITE_LLM)
  approveModelAccessRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewModelAccessRequestDto,
  ) {
    return this.llmService.approveModelAccessRequest(requestId, user.sub, dto);
  }

  @Post("llm/model-requests/:requestId/reject")
  @Permissions(Permission.WRITE_LLM)
  rejectModelAccessRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewModelAccessRequestDto,
  ) {
    return this.llmService.rejectModelAccessRequest(requestId, user.sub, dto);
  }

  @Get("projects/:projectId/vectordb/keys")
  @Permissions(Permission.READ_VECTORDB)
  vectorKeys(@Param("projectId") projectId: string) {
    return this.vectorDbService.listProjectKeys(projectId);
  }
}
