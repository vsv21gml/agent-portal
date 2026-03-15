import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { CreateAgentDto } from "./dto/create-agent.dto";
import { AgentsService } from "./agents.service";

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

  @Get(":agentId")
  getAgent(@Param("agentId") agentId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.getAgent(agentId, user.sub);
  }

  @Get(":agentId/logs")
  getAgentLogs(@Param("agentId") agentId: string, @CurrentUser() user: JwtPayload) {
    return this.agentsService.getAgentLogs(agentId, user.sub);
  }
}
