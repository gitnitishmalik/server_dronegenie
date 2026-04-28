import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { MediaType, MediaSize } from '@prisma/client'
import { Transform } from "class-transformer";

export class IndustryMediaDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    industryId: string

    @IsEnum(MediaType)
    @IsNotEmpty()
    @Transform(({ value }) => {
        if (value === undefined || value === null) return value;
        // If client sends "image" or "Image", we normalize to uppercase keys like "IMAGE"
        return typeof value === 'string' ? value.toUpperCase() : value;
    })
    type: MediaType;

    @IsEnum(MediaSize)
    @IsNotEmpty()
    @Transform(({ value }) => {
        if (value === undefined || value === null) return value;
        return typeof value === 'string' ? value.toUpperCase() : value;
    })
    size: MediaSize;
}