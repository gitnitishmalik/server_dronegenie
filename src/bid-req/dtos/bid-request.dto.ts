// create-bid-request.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsArray,
} from 'class-validator';

export class CreateBidRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  serviceId: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  area?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media?: string[];
}
