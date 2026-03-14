import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
import { GlobalRole } from "../../common/enums/global-role.enum";

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsEnum(GlobalRole)
  globalRole!: GlobalRole;
}
