import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuthService } from "../auth/auth.service";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { GlobalRole } from "../common/enums/global-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { GitlabService } from "../gitlab/gitlab.service";
import { LlmService } from "../llm/llm.service";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { ConnectProjectEndpointDto } from "./dto/connect-project-endpoint.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { CreateProjectEndpointDto } from "./dto/create-project-endpoint.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { UpdateResourceLimitDto } from "./dto/update-resource-limit.dto";
import { ProjectManagerGuard } from "./guards/project-manager.guard";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
    private readonly gitlabService: GitlabService,
    private readonly llmService: LlmService,
  ) {}

  @Post()
  async createProject(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.createProject(dto, user.sub);
  }

  @Get()
  listProjects(@CurrentUser() user: JwtPayload) {
    return this.projectsService.listProjects(user.sub);
  }

  @Get(":projectId")
  getProject(@Param("projectId") projectId: string) {
    return this.projectsService.getProject(projectId);
  }

  @Get(":projectId/overview")
  getOverview(@Param("projectId") projectId: string) {
    return this.projectsService.getOverview(projectId);
  }

  @Get(":projectId/endpoints")
  listEndpoints(@Param("projectId") projectId: string) {
    return this.projectsService.listEndpoints(projectId);
  }

  @Get(":projectId/members")
  listMembers(@Param("projectId") projectId: string) {
    return this.projectsService.listMembers(projectId);
  }

  @UseGuards(ProjectManagerGuard)
  @Get(":projectId/available-users")
  listAvailableUsers(@Param("projectId") projectId: string) {
    return this.projectsService.listAvailableUsers(projectId);
  }

  @UseGuards(ProjectManagerGuard)
  @Post(":projectId/members")
  async addMember(@Param("projectId") projectId: string, @Body() dto: AddProjectMemberDto, @CurrentUser() actor: JwtPayload) {
    const member = await this.projectsService.addMember(projectId, dto, actor.sub);
    const targetUser = await this.authService.findById(dto.userId);
    await this.gitlabService.syncMemberAccess(projectId, dto.userId, dto.role, targetUser?.email);
    return member;
  }

  @UseGuards(ProjectManagerGuard)
  @Delete(":projectId/members/:userId")
  async removeMember(@Param("projectId") projectId: string, @Param("userId") userId: string, @CurrentUser() actor: JwtPayload) {
    const targetUser = await this.authService.findById(userId);
    await this.projectsService.removeMember(projectId, userId, actor.sub);
    await this.gitlabService.removeMemberAccess(projectId, userId, targetUser?.email);
    return { success: true };
  }

  @Get(":projectId/resource-limit")
  getResourceLimit(@Param("projectId") projectId: string) {
    return this.projectsService.getResourceLimit(projectId);
  }

  @UseGuards(ProjectManagerGuard)
  @Patch(":projectId")
  updateProject(@Param("projectId") projectId: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.updateProject(projectId, dto, user.sub);
  }

  @UseGuards(ProjectManagerGuard)
  @Post(":projectId/endpoints")
  createEndpoint(@Param("projectId") projectId: string, @Body() dto: CreateProjectEndpointDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.createEndpoint(projectId, dto, user.sub);
  }

  @UseGuards(ProjectManagerGuard)
  @Post(":projectId/endpoints/:endpointId/connect")
  connectEndpoint(
    @Param("projectId") projectId: string,
    @Param("endpointId") endpointId: string,
    @Body() dto: ConnectProjectEndpointDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.connectEndpoint(projectId, endpointId, dto, user.sub);
  }

  @UseGuards(ProjectManagerGuard)
  @Post(":projectId/endpoints/:endpointId/disconnect")
  disconnectEndpoint(@Param("projectId") projectId: string, @Param("endpointId") endpointId: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.disconnectEndpoint(projectId, endpointId, user.sub);
  }

  @UseGuards(ProjectManagerGuard)
  @Delete(":projectId/endpoints/:endpointId")
  deleteEndpoint(@Param("projectId") projectId: string, @Param("endpointId") endpointId: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.deleteEndpoint(projectId, endpointId, user.sub);
  }

  @UseGuards(ProjectManagerGuard)
  @Patch(":projectId/resource-limit")
  updateResourceLimit(@Param("projectId") projectId: string, @Body() dto: UpdateResourceLimitDto) {
    return this.projectsService.updateResourceLimit(projectId, dto);
  }

  @UseGuards(ProjectManagerGuard)
  @Delete(":projectId")
  async deleteProject(@Param("projectId") projectId: string, @CurrentUser() user: JwtPayload) {
    await this.projectsService.deleteProject(projectId, user.sub);
    return { success: true };
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_PROJECT)
  @Post(":projectId/approve")
  async approveProject(@Param("projectId") projectId: string, @CurrentUser() user: JwtPayload) {
    const project = await this.projectsService.approveProject(projectId, user.sub);
    await this.gitlabService.ensureProjectGroup(project.id);
    await this.llmService.ensureTeam(project.id);
    return project;
  }

  @Roles(GlobalRole.ADMIN)
  @Permissions(Permission.WRITE_PROJECT)
  @Post(":projectId/reject")
  rejectProject(@Param("projectId") projectId: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.rejectProject(projectId, user.sub);
  }
}
