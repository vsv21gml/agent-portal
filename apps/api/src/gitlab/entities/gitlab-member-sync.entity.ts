import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("gitlab_member_sync")
@Unique(["projectId", "userId"])
export class GitlabMemberSyncEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  userId!: string;

  @Column()
  accessLevel!: number;

  @CreateDateColumn()
  syncedAt!: Date;
}
