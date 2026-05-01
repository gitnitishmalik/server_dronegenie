import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
