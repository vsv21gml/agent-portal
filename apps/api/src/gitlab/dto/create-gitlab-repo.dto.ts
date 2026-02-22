import { IsString, Matches, MaxLength } from "class-validator";

export class CreateGitlabRepoDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/)
  repoName!: string;
}
