import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { Permission } from "../common/enums/permission.enum";
import { IssueVectorKeyDto } from "./dto/issue-vector-key.dto";
import { VectorDbService } from "./vectordb.service";

@Controller("vectordb")
export class VectorDbController {
  constructor(private readonly vectorDbService: VectorDbService) {}

  @Post("projects/:projectId/keys")
  @Permissions(Permission.WRITE_VECTORDB)
  issueKey(@Param("projectId") projectId: string, @Body() dto: IssueVectorKeyDto, @CurrentUser() user: JwtPayload) {
    return this.vectorDbService.issueKey(projectId, user.sub, dto);
  }

  @Get("projects/:projectId/keys")
  @Permissions(Permission.READ_VECTORDB)
  keys(@Param("projectId") projectId: string) {
    return this.vectorDbService.listProjectKeys(projectId);
  }
}
