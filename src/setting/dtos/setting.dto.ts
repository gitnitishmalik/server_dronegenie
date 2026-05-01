import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateSettingDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  bannerImg?: string;
}

export class UpdateSettingDto extends PartialType(CreateSettingDto) {}
