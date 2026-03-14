import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

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

  @Column({ type: "text", nullable: true })
  remoteRepoId!: string | null;

  @Column({ type: "text", nullable: true })
  cloneUrl!: string | null;

  @Column({ type: "text", nullable: true })
  webUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
