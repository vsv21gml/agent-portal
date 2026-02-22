import { IsUUID } from "class-validator";

export class CreateNotebookDto {
  @IsUUID()
  projectId!: string;
}
