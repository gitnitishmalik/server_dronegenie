import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsNotEmpty,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { DgChargeType } from '@prisma/client';

export class CreateDroneServiceDto {
  @ApiProperty()
  @IsString()
  service_name: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  industryId?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  unit?: string;

  @Transform(({ value }) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  })
  @ApiProperty()
  @IsInt()
  priorty: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  rate_on_qty?: string;

  @ApiProperty()
  @IsString()
  uav_type: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  feature_needed: string;

  @ApiProperty()
  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  gst?: number;

  @ApiProperty({
    enum: DgChargeType,
    default: DgChargeType.PERCENT,
    description:
      'PERCENT treats dgCharges as % of vendor price; FLAT treats it as a ₹ amount.',
  })
  @IsOptional()
  @IsEnum(DgChargeType)
  dgChargeType?: DgChargeType;

  @ApiProperty()
  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Drone Genie Charges must be a number' },
  )
  @Min(0)
  // Cap at 100 only when dgChargeType is PERCENT (or omitted — backwards-compat default).
  @ValidateIf((o) => !o.dgChargeType || o.dgChargeType === DgChargeType.PERCENT)
  @Max(100, { message: 'DG Charges must be ≤ 100 when using PERCENT type' })
  dgCharges?: number;

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
