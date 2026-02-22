import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("gitlab_repos")
@Unique(["projectId", "repoName"])
export class GitlabRepoEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  repoName!: string;

  @Column()
  namespacePath!: string;
}
