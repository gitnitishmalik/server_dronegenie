import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dto';

export class GetCustomerDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comp_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representative?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representative_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  GST?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  PAN?: string;
}
