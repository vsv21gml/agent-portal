import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("mcp_deployments")
export class McpDeploymentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  repoId!: string;

  @Column()
  ownerUserId!: string;

  @Column()
  mcpName!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column()
  dockerfilePath!: string;

  @Column({ default: "N" })
  useLlm!: string;

  @Column({ default: "" })
  litellmModel!: string;

  @Column()
  ecrRepository!: string;

  @Column()
  imageTag!: string;

  @Column()
  imageUrl!: string;

  @Column()
  endpointUrl!: string;

  @Column({ default: "pending" })
  status!: string;

  @Column({ default: "N" })
  deleteYn!: string;

  @Column()
  namespace!: string;

  @Column()
  buildJobName!: string;

  @Column()
  deploymentName!: string;

  @Column()
  serviceName!: string;

  @Column()
  ingressName!: string;

  @Column({ type: "text", nullable: true })
  lastMessage!: string | null;

  @Column({ type: "text", nullable: true })
  litellmApiKey!: string | null;

  @Column({ type: "uuid", nullable: true })
  modelAccessRequestId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
