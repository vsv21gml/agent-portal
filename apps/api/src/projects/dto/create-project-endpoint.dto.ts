import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateProjectEndpointDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
