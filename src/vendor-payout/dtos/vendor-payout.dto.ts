import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { VendorPayoutStatus } from '@prisma/client';


// Creating the Route linked account only needs a handful of fields that we
// derive from the vendor record (legal name, business type, email, phone).
// Everything else — bank details, address, KYC docs — is collected by
// Razorpay's hosted KYC flow after the account exists. Keep this DTO tiny.
export class CreateRouteAccountDto {
  @ApiProperty({ required: false, default: 'professional_services' })
  @IsOptional()
  @IsString()
  profile_category?: string;

  @ApiProperty({ required: false, default: 'consulting' })
  @IsOptional()
  @IsString()
  profile_subcategory?: string;
}


// Admin-side list of all vendor payouts. Filters support operational needs:
// "which ones failed?", "what did vendor X earn last week?", "daily reconcile".
export class AdminPayoutListDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({ required: false, enum: VendorPayoutStatus })
  @IsOptional()
  @IsEnum(VendorPayoutStatus)
  status?: VendorPayoutStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
