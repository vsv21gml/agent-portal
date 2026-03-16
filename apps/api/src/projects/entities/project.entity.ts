import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("projects")
export class ProjectEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({ type: "varchar", length: 1, default: "N" })
  deletedYn!: string;

  @Column({ type: "varchar", default: "approved" })
  approvalStatus!: "pending" | "approved" | "rejected";

  @Column({ nullable: true })
  requestedByUserId!: string | null;

  @Column({ nullable: true })
  approvedByUserId!: string | null;

  @Column({ type: "datetime", nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
