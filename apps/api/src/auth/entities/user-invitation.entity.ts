import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { GlobalRole } from "../../common/enums/global-role.enum";

@Entity("user_invitations")
export class UserInvitationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  displayName!: string;

  @Column({ type: "varchar", default: GlobalRole.USER })
  globalRole!: GlobalRole;

  @Column({ unique: true })
  token!: string;

  @Column()
  invitedByUserId!: string;

  @Column({ type: "timestamp", nullable: true })
  acceptedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
