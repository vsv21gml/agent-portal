import { IsAlphanumeric, IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsAlphanumeric()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;
}
