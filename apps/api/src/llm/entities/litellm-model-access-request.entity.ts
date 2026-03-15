import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type LiteLlmModelAccessRequestStatus = "pending" | "approved" | "rejected";

@Entity("litellm_model_access_requests")
export class LiteLlmModelAccessRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  ownerUserId!: string;

  @Column()
  modelName!: string;

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
