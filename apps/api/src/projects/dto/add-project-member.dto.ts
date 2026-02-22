import { IsEnum, IsUUID } from "class-validator";
import { ProjectRole } from "../../common/enums/project-role.enum";

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
