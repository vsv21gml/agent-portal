import { IsBoolean } from "class-validator";

export class SetDefaultModelDto {
  @IsBoolean()
  isDefault!: boolean;
}
