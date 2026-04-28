import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { CompanyType, UserRole } from '@prisma/client';

export class CreateVendorDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsEmail() @IsNotEmpty() email: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;

  // @ApiProperty({ enum: UserRole, default: UserRole.CUSTOMER })
  // @IsEnum(UserRole) role: UserRole = UserRole.CUSTOMER;

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

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service ID is required' })
  @IsString({ each: true, message: 'Each service ID must be a string' })
  @IsNotEmpty({ each: true, message: 'Service IDs cannot be empty' })
  serviceIds: string[];
}


export class VendorProfileDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;


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
