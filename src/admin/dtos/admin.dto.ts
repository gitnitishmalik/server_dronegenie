import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class QueryFilterDto{
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    month: string

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    year: string
}