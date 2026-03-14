import { IsIn, IsUUID } from "class-validator";

const runtimes = ["NODE22", "NODE23", "NODE24", "PYTHON3.8"] as const;

export class CreateWorkspaceDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  repoId!: string;

  @IsIn(runtimes)
  runtime!: (typeof runtimes)[number];
}
