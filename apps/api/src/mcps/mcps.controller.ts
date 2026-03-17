import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { CreateMcpDto } from "./dto/create-mcp.dto";
import { McpsService } from "./mcps.service";

type McpPlaygroundInspectDto = {
  transportType?: "streamable-http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

type McpInspectorInspectDto = {
  transportType: "streamable-http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

type McpInspectorToolCallDto = {
  transportType: "streamable-http" | "sse" | "stdio";
  url?: string;
  command?: string;
  commandArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
  toolName: string;
  toolArgs?: Record<string, unknown>;
};

type McpPlaygroundChatDto = {
  transportType?: "streamable-http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  modelName: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
};

@Controller("mcps")
export class McpsController {
  constructor(private readonly mcpsService: McpsService) {}

  @Post()
  createMcp(@Body() dto: CreateMcpDto, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.createMcp(dto, user.sub);
  }

  @Get("project/:projectId")
  listByProject(@Param("projectId") projectId: string, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.listByProject(projectId, user.sub);
  }

  @Post("playground/inspect")
  inspectExternalMcp(@Body() dto: McpPlaygroundInspectDto, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.inspectExternalMcp(
      dto.transportType ?? "streamable-http",
      {
        url: dto.url ?? "",
        command: dto.command ?? "",
        args: dto.args ?? [],
        cwd: dto.cwd ?? "",
        env: dto.env ?? {},
      },
      user.sub,
      user.email,
    );
  }

  @Post("playground/chat")
  chatExternalMcp(@Body() dto: McpPlaygroundChatDto, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.chatWithExternalMcp(
      dto.transportType ?? "streamable-http",
      {
        url: dto.url ?? "",
        command: dto.command ?? "",
        args: dto.args ?? [],
        cwd: dto.cwd ?? "",
        env: dto.env ?? {},
      },
      user.sub,
      user.email,
      dto.modelName,
      dto.messages,
    );
  }

  @Post("inspector/inspect")
  inspectInspectorMcp(@Body() dto: McpInspectorInspectDto, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.inspectInspectorMcp(
      dto.transportType,
      {
        url: dto.url ?? "",
        command: dto.command ?? "",
        args: dto.args ?? [],
        cwd: dto.cwd ?? "",
        env: dto.env ?? {},
      },
      user.sub,
      user.email,
    );
  }

  @Post("inspector/tools/call")
  callInspectorExternalTool(@Body() dto: McpInspectorToolCallDto, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.callInspectorExternalTool(
      dto.transportType,
      {
        url: dto.url ?? "",
        command: dto.command ?? "",
        args: dto.commandArgs ?? [],
        cwd: dto.cwd ?? "",
        env: dto.env ?? {},
      },
      user.sub,
      user.email,
      dto.toolName,
      dto.toolArgs ?? {},
    );
  }

  @Get(":mcpId/card")
  getMcpCard(@Param("mcpId") mcpId: string, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.getMcpCard(mcpId, user.sub);
  }

  @Get(":mcpId")
  getMcp(@Param("mcpId") mcpId: string, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.getMcp(mcpId, user.sub);
  }

  @Get(":mcpId/logs")
  getMcpLogs(@Param("mcpId") mcpId: string, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.getMcpLogs(mcpId, user.sub);
  }

  @Post(":mcpId/stop")
  stopMcp(@Param("mcpId") mcpId: string, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.stopMcp(mcpId, user.sub);
  }

  @Post(":mcpId/restart")
  restartMcp(@Param("mcpId") mcpId: string, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.restartMcp(mcpId, user.sub);
  }

  @Delete(":mcpId")
  deleteMcp(@Param("mcpId") mcpId: string, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.deleteMcp(mcpId, user.sub);
  }

  @Post(":mcpId/tools/call")
  callMcpTool(@Param("mcpId") mcpId: string, @Body() dto: { toolName: string; args?: Record<string, unknown> }, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.callMcpToolById(mcpId, user.sub, dto.toolName, dto.args ?? {});
  }

  @Post(":mcpId/chat")
  chatWithMcp(@Param("mcpId") mcpId: string, @Body() dto: McpPlaygroundChatDto, @CurrentUser() user: JwtPayload) {
    return this.mcpsService.chatWithMcp(mcpId, user.sub, user.email, dto.modelName, dto.messages);
  }
}
