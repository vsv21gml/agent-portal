import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GlobalRole } from "../common/enums/global-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { RolePermissionEntity } from "./entities/role-permission.entity";

const DEFAULT_ROLE_PERMISSIONS: Record<GlobalRole, Permission[]> = {
  [GlobalRole.ADMIN]: Object.values(Permission),
  [GlobalRole.USER]: [
    Permission.READ_PROJECT,
    Permission.WRITE_PROJECT,
    Permission.READ_RESOURCE,
    Permission.WRITE_RESOURCE,
    Permission.READ_GITLAB,
    Permission.WRITE_GITLAB,
    Permission.READ_LLM,
    Permission.WRITE_LLM,
    Permission.READ_VECTORDB,
    Permission.WRITE_VECTORDB,
  ],
};

@Injectable()
export class PermissionsService implements OnModuleInit {
  constructor(
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const role of Object.values(GlobalRole)) {
      const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
      for (const permission of defaults) {
        const exists = await this.rolePermissionRepository.findOne({ where: { role, permission } });
        if (!exists) {
          await this.rolePermissionRepository.save(this.rolePermissionRepository.create({ role, permission }));
        }
      }
    }
  }

  async hasPermissions(role: GlobalRole, requiredPermissions: Permission[]): Promise<boolean> {
    if (requiredPermissions.length === 0) {
      return true;
    }
    const grantedRows = await this.rolePermissionRepository.find({ where: { role } });
    const granted = new Set(grantedRows.map((row) => row.permission));
    return requiredPermissions.every((permission) => granted.has(permission));
  }

  async listRolePermissions(): Promise<RolePermissionEntity[]> {
    return this.rolePermissionRepository.find({ order: { role: "ASC", permission: "ASC" } });
  }

  async setRolePermissions(role: GlobalRole, permissions: Permission[]): Promise<RolePermissionEntity[]> {
    await this.rolePermissionRepository.delete({ role });
    if (permissions.length === 0) {
      return [];
    }
    const created = permissions.map((permission) => this.rolePermissionRepository.create({ role, permission }));
    return this.rolePermissionRepository.save(created);
  }
}
