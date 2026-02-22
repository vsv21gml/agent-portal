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
}
