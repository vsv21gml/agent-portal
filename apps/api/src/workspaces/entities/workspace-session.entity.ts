import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("workspace_sessions")
@Unique(["projectId", "repoId", "userId"])
export class WorkspaceSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  repoId!: string;

  @Column()
  userId!: string;

  @Column()
  runtime!: string;

  @Column()
  repoName!: string;

  @Column()
  endpointUrl!: string;

  @Column({ default: "provisioning" })
  status!: string;

  @Column()
  namespace!: string;

  @Column()
  pvcName!: string;

  @Column()
  deploymentName!: string;

  @Column()
  serviceName!: string;

  @Column()
  ingressName!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
