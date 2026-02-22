import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthService } from "../auth/auth.service";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { GitlabService } from "../gitlab/gitlab.service";
import { LlmService } from "../llm/llm.service";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
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
    await this.gitlabService.ensureProjectGroup(project.id, project.slug);
    await this.llmService.ensureTeam(project.id, project.slug);
    return project;
  }

  @Get()
  listProjects() {
    return this.projectsService.listProjects();
  }

  @Get(":projectId")
  getProject(@Param("projectId") projectId: string) {
    return this.projectsService.getProject(projectId);
  }

  @Get(":projectId/members")
  listMembers(@Param("projectId") projectId: string) {
    return this.projectsService.listMembers(projectId);
  }

  @UseGuards(ProjectManagerGuard)
  @Post(":projectId/members")
  async addMember(@Param("projectId") projectId: string, @Body() dto: AddProjectMemberDto) {
    const member = await this.projectsService.addMember(projectId, dto);
    const user = await this.authService.findById(dto.userId);
    await this.gitlabService.syncMemberAccess(projectId, dto.userId, dto.role, user?.email);
    return member;
  }

  @Get(":projectId/resource-limit")
  getResourceLimit(@Param("projectId") projectId: string) {
    return this.projectsService.getResourceLimit(projectId);
  }

  @UseGuards(ProjectManagerGuard)
  @Patch(":projectId/resource-limit")
  updateResourceLimit(@Param("projectId") projectId: string, @Body() dto: UpdateResourceLimitDto) {
    return this.projectsService.updateResourceLimit(projectId, dto);
  }
}
