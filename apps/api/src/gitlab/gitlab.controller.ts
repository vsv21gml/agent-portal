import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateGitlabRepoDto } from "./dto/create-gitlab-repo.dto";
import { GitlabService } from "./gitlab.service";

@Controller("gitlab")
export class GitlabController {
  constructor(private readonly gitlabService: GitlabService) {}

  @Post("projects/:projectId/group/:projectSlug")
  ensureGroup(@Param("projectId") projectId: string, @Param("projectSlug") projectSlug: string) {
    return this.gitlabService.ensureProjectGroup(projectId, projectSlug);
  }

  @Post("projects/:projectId/repos")
  createRepo(@Param("projectId") projectId: string, @Body() dto: CreateGitlabRepoDto) {
    return this.gitlabService.createRepo(projectId, dto);
  }

  @Get("projects/:projectId/repos")
  repos(@Param("projectId") projectId: string) {
    return this.gitlabService.listRepos(projectId);
  }
}
