import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsInt, IsMongoId, IsArray, ArrayUnique } from 'class-validator';
import { Transform } from 'class-transformer';
import { CategoryStatus } from '../../common/enums/category-status.enum'

export class CreateServiceCategoryDto {
  @ApiProperty()
  @IsString()
  category_name: string;

  @Transform(({ value }) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  })
  @ApiProperty()
  @IsInt()
  priorty: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  shortDesc?: string

  @ApiProperty({ enum: CategoryStatus, required: false })
  @IsOptional()
  @IsEnum(CategoryStatus)
  status?: CategoryStatus;

  @IsOptional()
  @IsString()
  metaTitle?: string

  @IsOptional()
  @IsString()
  metaDescription?: string

  @IsOptional()
  @IsString()
  metaKeyword?: string
}



export class UpdateCategoryServicesDto {
  @IsMongoId()
  categoryId: string;

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

  @IsOptional()
  @IsString()
  metaTitle?: string

  @IsOptional()
  @IsString()
  metaDescription?: string

  @IsOptional()
  @IsString()
  metaKeyword?: string
}


export class UpdateCategoryPropertiesDto {
  @IsMongoId()
  categoryId: string;

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

