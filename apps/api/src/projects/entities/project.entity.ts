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

  @Column({ type: "varchar", nullable: true })
  requestedByUserId!: string | null;

  @Column({ type: "varchar", nullable: true })
  approvedByUserId!: string | null;

  @Column({ type: "timestamp", nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
