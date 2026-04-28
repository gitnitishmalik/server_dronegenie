import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from "class-validator";


// A single vendor-proposed milestone. vendor_amount is what the vendor
// receives for that milestone — DG commission + GST are layered on top
// at order-accept time.
export class MilestoneDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ description: 'Vendor amount for this milestone in ₹' })
    @Type(() => Number)
    @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    vendor_amount: number;
}


// Multipart requests can't natively carry nested objects, so the FE
// stringifies the milestones array into a single field. Parse it back
// here before class-validator runs.
const parseMilestonesJson = ({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};


export class CreateBidReplyDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    userId: string

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    bidReqId: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    media?: string

    @ApiProperty()
    @IsInt()
    @IsNotEmpty()
    @Min(1)
    @Type(() => Number)
    @Transform(({ value }) => parseInt(value, 10))
    price: number

    @ApiProperty()
    @IsString()
    @IsDateString()
    startDate: string

    @ApiProperty()
    @IsString()
    @IsDateString()
    endDate: string

    // NOTE: @ValidateNested + @Type + @Transform on a JSON-string field fights
    // with ValidationPipe({ whitelist: true }) in this project's pipeline —
    // class-transformer strips the inner milestone fields, leaving `[{}]` by
    // the time the service gets it. The service validates each milestone
    // manually (title non-empty, vendor_amount > 0) so we only check the
    // array shape here and keep the per-element type check out of the DTO.
    @ApiProperty({ type: [MilestoneDto] })
    @Transform(parseMilestonesJson)
    @IsArray()
    @ArrayMinSize(1, { message: 'At least one milestone is required' })
    milestones: MilestoneDto[]
}


export class UpdateBidReplyDto {
    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    media?: string

    @ApiProperty()
    @IsInt()
    @IsOptional()
    @Min(1)
    @Type(() => Number)
    @Transform(({ value }) => parseInt(value, 10))
    price?: number

    @ApiProperty()
    @IsDateString()
    @IsOptional()
    startDate?: string

    @ApiProperty()
    @IsDateString()
    @IsOptional()
    endDate?: string

    // See CreateBidReplyDto comment — nested validation stripped by whitelist.
    @ApiProperty({ type: [MilestoneDto], required: false })
    @IsOptional()
    @Transform(parseMilestonesJson)
    @IsArray()
    @ArrayMinSize(1, { message: 'At least one milestone is required' })
    milestones?: MilestoneDto[]
}
