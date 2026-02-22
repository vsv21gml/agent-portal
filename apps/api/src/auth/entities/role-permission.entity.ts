import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";
import { GlobalRole } from "../../common/enums/global-role.enum";
import { Permission } from "../../common/enums/permission.enum";

@Entity("role_permissions")
@Unique(["role", "permission"])
export class RolePermissionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  role!: GlobalRole;

  @Column({ type: "varchar" })
  permission!: Permission;
}
