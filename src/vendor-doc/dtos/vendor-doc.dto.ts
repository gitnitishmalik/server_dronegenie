import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateVendorDocDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsString()
  title: string;
}
