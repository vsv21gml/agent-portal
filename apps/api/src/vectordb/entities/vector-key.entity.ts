import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("vector_keys")
export class VectorKeyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  projectId!: string;

  @Column()
  ownerUserId!: string;

  @Column()
  keyAlias!: string;

  @Column()
  indexName!: string;

  @Column({ type: "text", nullable: true })
  remoteKeyId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
