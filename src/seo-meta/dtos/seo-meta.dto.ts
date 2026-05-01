import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMetaDto {
  @IsString()
  @IsNotEmpty()
  pageName: string;

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;

  @IsString()
  @IsOptional()
  metaKeyword?: string;
}

export class UpdateMetaDto {
  @IsString()
  @IsOptional()
  pageName?: string;

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;

  @IsString()
  @IsOptional()
  metaKeyword?: string;
}
