import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateModelAccessRequestDto {
  @IsString()
  @MaxLength(255)
  modelName!: string;

  @IsOptional()
  @IsIn(["personal", "agent_deploy"])
  requestType?: "personal" | "agent_deploy";

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;
}
