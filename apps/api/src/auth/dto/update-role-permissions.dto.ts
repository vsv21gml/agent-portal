import { IsArray, IsEnum } from "class-validator";
import { Permission } from "../../common/enums/permission.enum";

export class UpdateRolePermissionsDto {
  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions!: Permission[];
}
