import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RequestCallbackDto {
  @IsString()
  @IsOptional()
  name: string;

  @IsEmail()
  @IsOptional()
  email: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsOptional()
  message: string;
}
