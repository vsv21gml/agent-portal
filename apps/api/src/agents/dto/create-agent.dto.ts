import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  repoId!: string;

  @IsString()
  @IsNotEmpty()
  agentName!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  dockerfilePath?: string;
}
