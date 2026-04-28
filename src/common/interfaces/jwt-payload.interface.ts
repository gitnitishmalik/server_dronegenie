import { UserRole } from '@prisma/client';

export type JwtPayload = {
  identification: string;
  sub: number;
  role: UserRole;
};
