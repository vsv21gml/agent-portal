import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthService } from "../auth/auth.service";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { GitlabService } from "../gitlab/gitlab.service";
import { LlmService } from "../llm/llm.service";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
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
    const project = await this.projectsService.createProject(dto, user.sub);
    await this.gitlabService.ensureProjectGroup(project.id);
    await this.llmService.ensureTeam(project.id);
    return project;
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
  async addMember(@Param("projectId") projectId: string, @Body() dto: AddProjectMemberDto) {
    const member = await this.projectsService.addMember(projectId, dto);
    const user = await this.authService.findById(dto.userId);
    await this.gitlabService.syncMemberAccess(projectId, dto.userId, dto.role, user?.email);
    return member;
  }

  @UseGuards(ProjectManagerGuard)
  @Delete(":projectId/members/:userId")
  async removeMember(@Param("projectId") projectId: string, @Param("userId") userId: string) {
    const user = await this.authService.findById(userId);
    await this.projectsService.removeMember(projectId, userId);
    await this.gitlabService.removeMemberAccess(projectId, userId, user?.email);
    return { success: true };
  }

  @Get(":projectId/resource-limit")
  getResourceLimit(@Param("projectId") projectId: string) {
    return this.projectsService.getResourceLimit(projectId);
  }

  @UseGuards(ProjectManagerGuard)
  @Patch(":projectId")
  updateProject(@Param("projectId") projectId: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.updateProject(projectId, dto);
  }

  @UseGuards(ProjectManagerGuard)
  @Patch(":projectId/resource-limit")
  updateResourceLimit(@Param("projectId") projectId: string, @Body() dto: UpdateResourceLimitDto) {
    return this.projectsService.updateResourceLimit(projectId, dto);
  }

  @UseGuards(ProjectManagerGuard)
  @Delete(":projectId")
  async deleteProject(@Param("projectId") projectId: string) {
    await this.projectsService.deleteProject(projectId);
    return { success: true };
  }
}
