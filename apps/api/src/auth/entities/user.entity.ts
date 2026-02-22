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

  @CreateDateColumn()
  createdAt!: Date;
}
