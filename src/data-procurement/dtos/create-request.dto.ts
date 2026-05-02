import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { SensorClass, ProcessingLevel } from '@prisma/client';

export class CreateRequestDto {
  @IsNotEmpty()
  boundary: any; // GeoJSON Polygon

  @IsEnum(SensorClass)
  sensorClass: SensorClass;

  @IsOptional()
  @IsString()
  sensorModel?: string;

  @IsDateString()
  captureDate: string;

  @IsNumber()
  @Min(0.1)
  claimedGsdCm: number;

  @IsNumber()
  @Min(0)
  positionalAccuracyM: number;

  @IsString()
  crsCode: string;

  @IsEnum(ProcessingLevel)
  processingLevel: ProcessingLevel;

  @IsOptional()
  @IsString()
  weatherNotes?: string;
}
