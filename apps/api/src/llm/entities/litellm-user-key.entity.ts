import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("litellm_user_keys")
export class LiteLlmUserKeyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  ownerUserId!: string;

  @Column()
  userEmail!: string;

  @Column()
  keyAlias!: string;

  @Column({ type: "varchar", nullable: true })
  remoteUserId!: string | null;

  @Column({ type: "varchar", nullable: true })
  remoteKeyId!: string | null;

  @Column({ type: "text", nullable: true })
  apiKey!: string | null;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 100 })
  maxBudgetUsd!: number;

  @Column({ default: "1mo" })
  budgetDuration!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
