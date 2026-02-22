import { IsString, MaxLength } from "class-validator";

export class IssueLlmKeyDto {
  @IsString()
  @MaxLength(100)
  keyAlias!: string;
}
