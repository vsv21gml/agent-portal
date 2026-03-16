import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateMcpDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  repoId!: string;

  @IsString()
  @IsNotEmpty()
  mcpName!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  dockerfilePath?: string;

  @IsOptional()
  useLlm?: boolean;

  @IsString()
  @IsOptional()
  litellmModel?: string;
}
