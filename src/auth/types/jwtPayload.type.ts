import { UserRole } from '@prisma/client';

export type JwtPayload = {
  identification: string;
  sub: string;
  role: UserRole[];
};
