import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateFaqDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  answer: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  priorty: number;

  @ApiProperty()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  isActive?: boolean;
}

export class UpdateFaqDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  question?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  answer?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  priorty?: number;

  @ApiProperty()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  isActive?: boolean;
}

export class GetFaqByRole {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;
}
