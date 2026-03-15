import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { CreateGitlabRepoDto } from "./dto/create-gitlab-repo.dto";
import { GitlabService } from "./gitlab.service";

@Controller("gitlab")
export class GitlabController {
  constructor(private readonly gitlabService: GitlabService) {}

  @Post("projects/:projectId/group")
  ensureGroup(@Param("projectId") projectId: string) {
    return this.gitlabService.ensureProjectGroup(projectId);
  }

  @Post("projects/:projectId/repos")
  createRepo(@Param("projectId") projectId: string, @Body() dto: CreateGitlabRepoDto, @CurrentUser() user: JwtPayload) {
    return this.gitlabService.createRepo(projectId, dto, user.sub);
  }

  @Get("projects/:projectId/repos")
  repos(@Param("projectId") projectId: string) {
    return this.gitlabService.listRepos(projectId);
  }
}
