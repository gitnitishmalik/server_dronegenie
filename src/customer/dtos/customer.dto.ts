import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CompanyType, UserRole } from '@prisma/client';

export class CreateCustomerDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsEmail() @IsNotEmpty() email: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;


  @ApiProperty() @IsString() @IsNotEmpty() password: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comp_name?: string;

  @ApiProperty({ enum: CompanyType })
  @IsEnum(CompanyType)
  comp_type: CompanyType;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsString()
  website: string;

  @ApiProperty()
  @IsString()
  representative: string;

  @ApiProperty()
  @IsEmail()
  representative_email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  representative_phone?: string;

  @ApiProperty()
  @IsString()
  GST: string;

  @ApiProperty()
  @IsString()
  PAN: string;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  isActive: boolean;

  @ApiProperty()
  @IsBoolean()
  isTermsAccepted: boolean;
}


export class UpdateCustomerProfileDto {
  @ApiProperty() @IsString() @IsOptional() name: string;


  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comp_name?: string;

  @ApiProperty({ enum: CompanyType })
  @IsEnum(CompanyType)
  @IsOptional()
  comp_type: CompanyType;

  @ApiProperty()
  @IsString()
  @IsOptional()
  address: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  website: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  representative: string;

  @ApiProperty()
  @IsEmail()
  @IsOptional()
  representative_email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  representative_phone?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  GST: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  PAN: string;
}

export class QueryFilterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  month: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  year: string
}