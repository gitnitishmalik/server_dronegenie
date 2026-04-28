import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
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
