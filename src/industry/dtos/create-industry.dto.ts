import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IndustryStatus } from '@prisma/client';

export class CreateIndustryDto {
  @IsString()
  @IsNotEmpty()
  industry_name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value, 10))
  priorty: number;

  @IsEnum(IndustryStatus)
  @IsOptional()
  status?: IndustryStatus;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  metaKeyword?: string;
}

export class UpdateIndustryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  industry_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value, 10))
  priorty?: number;

  @IsEnum(IndustryStatus)
  @IsOptional()
  status?: IndustryStatus;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  metaKeyword?: string;
}

export class UpdateIndustryServicesDto {
  @IsMongoId()
  industryId: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  addServiceIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  removeServiceIds?: string[];
}

export class UpdateIndustryPropertiesDto {
  @IsString()
  industryId: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  addPropertyIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  removePropertyIds?: string[];
}
