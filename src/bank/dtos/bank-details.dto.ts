import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateBankDetailsDto {
  @ApiProperty({
    description: 'Vendor ID (optional, provide either vendorId or customerId)',
    required: false,
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({
    description:
      'Customer ID (optional, provide either vendorId or customerId)',
    required: false,
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  // Banking fields - required for NETBANKING
  @ApiProperty({
    description: 'Account holder name (required for NETBANKING)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.NETBANKING)
  @IsString()
  accountHolderName?: string;

  @ApiProperty({
    description: 'Account number (required for NETBANKING)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.NETBANKING)
  @IsString()
  accountNumber?: string;

  @ApiProperty({
    description: 'Bank address (required for NETBANKING)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.NETBANKING)
  @IsString()
  bankAddress?: string;

  @ApiProperty({
    description: 'IFSC code (required for NETBANKING)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.NETBANKING)
  @IsString()
  ifscCode?: string;

  @ApiProperty({
    description: 'SWIFT/IBAN code (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  swiftIbanCode?: string;

  // Credit card fields - required for CREDIT_CARD
  @ApiProperty({
    description: 'Card holder name (required for CREDIT_CARD)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  cardHolderName?: string;

  @ApiProperty({
    description: 'Card number (required for CREDIT_CARD)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  cardNumber?: string;

  @ApiProperty({
    description: 'Card expiry (required for CREDIT_CARD)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  cardExpiry?: string;

  @ApiProperty({
    description: 'Card CVV (required for CREDIT_CARD)',
    required: false,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  cardCvv?: string;
}
