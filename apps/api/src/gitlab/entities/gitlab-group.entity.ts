import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("gitlab_groups")
@Unique(["projectId"])
export class GitlabGroupEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  groupPath!: string;

  @Column({ type: "text", nullable: true })
  remoteGroupId!: string | null;

  @Column({ type: "text", nullable: true })
  webUrl!: string | null;
}
