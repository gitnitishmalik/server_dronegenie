// wcu-properties.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';

export class WCUPropertiesDto {
  @ApiProperty()
  @IsString()
  propHeading: string;

  @ApiProperty()
  @IsString()
  propDescription: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  propImage?: string;

  @Transform(({ value }) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  })
  @ApiProperty()
  @IsInt()
  propPriorty: number;
}
