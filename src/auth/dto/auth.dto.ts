import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType, UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  ArrayMinSize,
  IsArray,
  Length,
} from 'class-validator';

export class SignUpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ enum: UserRole, default: UserRole.VENDOR })
  @IsNotEmpty()
  role: UserRole;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CustomerSignupDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsEmail() @IsNotEmpty() email: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;

  @ApiProperty({ enum: UserRole, default: UserRole.CUSTOMER })
  @IsEnum(UserRole)
  role: UserRole = UserRole.CUSTOMER;

  @ApiProperty() @IsString() @IsNotEmpty() password: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comp_name?: string;
  @ApiProperty({ enum: CompanyType })
  @IsEnum(CompanyType)
  comp_type: CompanyType;
  @ApiProperty() @IsString() address: string;
  @ApiProperty() @IsString() website: string;
  @ApiProperty() @IsString() representative: string;
  @ApiProperty() @IsEmail() representative_email: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  representative_phone?: string;
  @ApiProperty() @IsString() GST: string;
  @ApiProperty() @IsString() PAN: string;
  @ApiProperty() @IsBoolean() isTermsAccepted: boolean;
}

export class VendorSignupAllDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(6, 72)
  password: string;

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
  @IsBoolean()
  isTermsAccepted: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // default false until OTP verify

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service ID is required' })
  @IsString({ each: true, message: 'Each service ID must be a string' })
  @IsNotEmpty({ each: true, message: 'Service IDs cannot be empty' })
  serviceIds: string[];
}

export class SignInDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}

export class OtpVerificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  otp: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class TokensDto {
  @ApiProperty()
  @IsString()
  accessToken: string;

  @ApiProperty()
  @IsString()
  refreshToken: string;

  @ApiProperty()
  @IsString()
  userId: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class UpdateRtHashDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  rtHash: string;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  waitForOtp: boolean;
}

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  newPassword?: string;
}

// reset-password.dto.ts
export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsNotEmpty()
  otp: string;

  @ApiProperty()
  @IsString()
  newPassword: string;
}

export class AdminUpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  // ✅ NEW: allow admin to toggle activation; coerces "true"/"false", "1"/"0", yes/no, on/off
  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(v)) return true;
      if (['false', '0', 'no', 'off'].includes(v)) return false;
    }
    return undefined; // keeps it optional if unparsable
  })
  isActive?: boolean;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}

export class ResetForgotPasswordDto {
  @ApiProperty()
  @IsString()
  newPassword: string;
}

//  NEW: Resend OTP DTO
export class ResendOtpDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+971501234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ChangePhoneDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'New phone number',
    example: '8985968574',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;
}
