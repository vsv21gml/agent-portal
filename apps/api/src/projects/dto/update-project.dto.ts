import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description!: string;
}
