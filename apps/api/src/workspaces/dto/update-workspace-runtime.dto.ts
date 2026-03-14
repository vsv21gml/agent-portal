import { IsIn } from "class-validator";

const runtimes = ["NODE22", "NODE23", "NODE24", "PYTHON3.8"] as const;

export class UpdateWorkspaceRuntimeDto {
  @IsIn(runtimes)
  runtime!: (typeof runtimes)[number];
}
