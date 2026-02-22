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

  @CreateDateColumn()
  createdAt!: Date;
}
