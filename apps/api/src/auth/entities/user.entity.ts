import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { GlobalRole } from "../../common/enums/global-role.enum";

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column()
  displayName!: string;

  @Column({ type: "varchar", default: GlobalRole.USER })
  globalRole!: GlobalRole;

  @Column({ type: "varchar", default: "approved" })
  approvalStatus!: "pending" | "approved" | "rejected";

  @Column({ type: "timestamp", nullable: true })
  approvedAt!: Date | null;

  @Column({ default: false })
  passwordResetRequired!: boolean;

  @Column({ type: "timestamp", nullable: true })
  passwordResetIssuedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
