import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { CreateAgentDto } from "./dto/create-agent.dto";
import { AgentsService } from "./agents.service";

type AgentChatDto = {
  message: string;
  contextId?: string | null;
};

type ExternalA2AInspectDto = {
  url: string;
};

type ExternalA2AChatDto = {
  url: string;
  message: string;
  contextId?: string | null;
};

@Controller("agents")
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  createAgent(@Body() dto: CreateAgentDto, @CurrentUser() user: JwtPayload) {
    return this.agentsService.createAgent(dto, user.sub);
  }

  @Get("project/:projectId")
  listByProject(@Param("projectId") projectId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.listByProject(projectId, user.sub);
  }

  @Post("playground/inspect")
  inspectExternalA2A(@Body() dto: ExternalA2AInspectDto, @CurrentUser() user: JwtPayload) {
    return this.agentsService.inspectExternalA2A(dto.url, user.sub);
  }

  @Post("playground/chat")
  chatExternalA2A(@Body() dto: ExternalA2AChatDto, @CurrentUser() user: JwtPayload) {
    return this.agentsService.chatExternalA2A(dto.url, dto.message, user.sub, dto.contextId ?? null);
  }

  @Get(":agentId")
  getAgent(@Param("agentId") agentId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.getAgent(agentId, user.sub);
  }

  @Get(":agentId/logs")
  getAgentLogs(@Param("agentId") agentId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.getAgentLogs(agentId, user.sub);
  }

  @Post(":agentId/stop")
  stopAgent(@Param("agentId") agentId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.stopAgent(agentId, user.sub);
  }

  @Post(":agentId/restart")
  restartAgent(@Param("agentId") agentId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.restartAgent(agentId, user.sub);
  }

  @Delete(":agentId")
  deleteAgent(@Param("agentId") agentId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.deleteAgent(agentId, user.sub);
  }

  @Post(":agentId/chat")
  chatWithAgent(@Param("agentId") agentId: string, @Body() dto: AgentChatDto, @CurrentUser() user: JwtPayload) {
    return this.agentsService.chatWithAgent(agentId, user.sub, dto.message, dto.contextId ?? null);
  }
}
