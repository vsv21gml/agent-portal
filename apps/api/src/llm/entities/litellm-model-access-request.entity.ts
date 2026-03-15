import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type LiteLlmModelAccessRequestStatus = "pending" | "approved" | "rejected";
export type LiteLlmModelAccessRequestType = "personal" | "agent_deploy";

@Entity("litellm_model_access_requests")
export class LiteLlmModelAccessRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  ownerUserId!: string;

  @Column()
  modelName!: string;

  @Column({ default: "personal" })
  requestType!: LiteLlmModelAccessRequestType;

  @Column({ type: "uuid", nullable: true })
  projectId!: string | null;

  @Column({ type: "uuid", nullable: true })
  agentId!: string | null;

  @Column({ default: "pending" })
  status!: LiteLlmModelAccessRequestStatus;

  @Column({ type: "uuid", nullable: true })
  reviewerUserId!: string | null;

  @Column({ type: "text", nullable: true })
  reviewNote!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
