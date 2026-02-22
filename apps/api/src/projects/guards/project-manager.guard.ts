import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ProjectRole } from "../../common/enums/project-role.enum";
import { JwtPayload } from "../../auth/types/jwt-payload.type";
import { ProjectsService } from "../projects.service";

@Injectable()
export class ProjectManagerGuard implements CanActivate {
  constructor(private readonly projectsService: ProjectsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: JwtPayload;
      params: { projectId: string };
    }>();
    const role = await this.projectsService.getMemberRole(request.params.projectId, request.user.sub);
    if (role !== ProjectRole.MANAGER) {
      throw new ForbiddenException("Project manager role required");
    }
    return true;
  }
}
