import { IsInt, Max, Min } from "class-validator";

export class UpdateResourceLimitDto {
  @IsInt()
  @Min(1)
  @Max(128)
  cpu!: number;

  @IsInt()
  @Min(1)
  @Max(512)
  memoryGi!: number;
}
