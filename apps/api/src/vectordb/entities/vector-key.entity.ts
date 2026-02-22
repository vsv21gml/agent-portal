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

  @CreateDateColumn()
  createdAt!: Date;
}
