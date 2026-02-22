import { IsString, MaxLength } from "class-validator";

export class IssueVectorKeyDto {
  @IsString()
  @MaxLength(100)
  keyAlias!: string;
}
