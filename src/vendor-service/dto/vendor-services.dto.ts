import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsMongoId, IsString, ArrayMinSize, IsNotEmpty } from 'class-validator';


export class AddServicesToVendorDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service ID is required' })
  @IsString({ each: true, message: 'Each service ID must be a string' })
  @IsNotEmpty({ each: true, message: 'Service IDs cannot be empty' })
  serviceIds: string[];
}