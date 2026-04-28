import { SetMetadata } from '@nestjs/common';

export const Admin = () => SetMetadata('isAdmin', true);
