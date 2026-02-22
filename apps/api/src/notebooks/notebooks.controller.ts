import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/types/jwt-payload.type";
import { CreateNotebookDto } from "./dto/create-notebook.dto";
import { NotebooksService } from "./notebooks.service";

@Controller("notebooks")
export class NotebooksController {
  constructor(private readonly notebooksService: NotebooksService) {}

  @Post()
  createNotebook(@Body() dto: CreateNotebookDto, @CurrentUser() user: JwtPayload) {
    return this.notebooksService.createForUser(dto, user.sub);
  }

  @Get("me")
  myNotebooks(@CurrentUser() user: JwtPayload) {
    return this.notebooksService.listMine(user.sub);
  }

  @Get("project/:projectId")
  projectNotebooks(@Param("projectId") projectId: string) {
    return this.notebooksService.listByProject(projectId);
  }

  @Get("project/:projectId/usage")
  projectUsage(@Param("projectId") projectId: string) {
    return this.notebooksService.getProjectUsage(projectId);
  }
}
