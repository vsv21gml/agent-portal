import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { IssueLlmKeyDto } from "./dto/issue-llm-key.dto";
import { LlmService } from "./llm.service";

@Controller("llm")
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post("projects/:projectId/team")
  ensureTeam(@Param("projectId") projectId: string) {
    return this.llmService.ensureTeam(projectId);
  }

  @Post("projects/:projectId/keys")
  issueKey(@Param("projectId") projectId: string, @Body() dto: IssueLlmKeyDto, @CurrentUser() user: JwtPayload) {
    return this.llmService.issueKey(projectId, user.sub, dto);
  }

  @Get("projects/:projectId/keys")
  projectKeys(@Param("projectId") projectId: string) {
    return this.llmService.listProjectKeys(projectId);
  }

  @Get("projects/:projectId/models")
  projectModels(@Param("projectId") projectId: string) {
    return this.llmService.listAvailableModels(projectId);
  }
}
