import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("litellm_keys")
export class LiteLlmKeyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  teamId!: string;

  @Column()
  ownerUserId!: string;

  @Column()
  keyAlias!: string;

  @Column({ type: "varchar", nullable: true })
  remoteKeyId!: string | null;

  @Column({ type: "text", nullable: true })
  apiKey!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
