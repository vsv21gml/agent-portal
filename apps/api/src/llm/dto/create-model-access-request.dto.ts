import { IsString, MaxLength } from "class-validator";

export class CreateModelAccessRequestDto {
  @IsString()
  @MaxLength(255)
  modelName!: string;
}
