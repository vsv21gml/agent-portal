import { GlobalRole } from "../../common/enums/global-role.enum";

export type JwtPayload = {
  sub: string;
  email: string;
  role: GlobalRole;
};
