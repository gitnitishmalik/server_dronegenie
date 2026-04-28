import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, Length, IsNotEmpty, IsOptional, IsString, Min, MinLength, MaxLength } from "class-validator";
import { OrderStatus } from "src/common/enums";

export class OrderDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    bidReplyId: string
}

export class UpdateOrderDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    otp: string
}

export class RedeemMilestoneOtpDto {
    @ApiProperty({ description: '6-digit OTP the customer received when they paid this milestone' })
    @IsString()
    @IsNotEmpty()
    @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
    otp: string
}

export class DisputeMilestoneDto {
    @ApiProperty({ description: 'Why the customer is disputing this milestone. Shown to admin.' })
    @IsString()
    @IsNotEmpty()
    @MinLength(10, { message: 'Dispute reason must be at least 10 characters' })
    @MaxLength(2000)
    reason: string
}

export enum MilestoneResolutionDecision {
    FAVOR_VENDOR = 'FAVOR_VENDOR',
    REFUND = 'REFUND',
}

export class ResolveMilestoneDto {
    @ApiProperty({
        enum: MilestoneResolutionDecision,
        description: 'FAVOR_VENDOR releases the held transfer to the vendor; REFUND reverses the transfer and refunds the customer.',
    })
    @IsEnum(MilestoneResolutionDecision)
    decision: MilestoneResolutionDecision

    @ApiProperty({ required: false, description: 'Admin note explaining the resolution; stored on the milestone for audit.' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string
}



export class AdminOrderReportDto {
  // 🔹 Pagination
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  // 🔹 Search (Order No, Vendor, Customer, Service)
  @IsOptional()
  @IsString()
  search?: string;

  // 🔹 Filters
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  // 🔹 Category filter
  @IsOptional()
  @IsString()
  categoryId?: string;

  // 🔹 Industry filter
  @IsOptional()
  @IsString()
  industryId?: string;
}