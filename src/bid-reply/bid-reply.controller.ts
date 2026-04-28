import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BidReplyService } from './bid-reply.service';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetCurrentUser, GetCurrentUserId, Roles } from 'src/common/decorators';
import { JwtPayload } from 'src/auth/types';
import { CreateBidReplyDto, UpdateBidReplyDto } from './dtos/bid-reply.dto';
import { UserRole } from '@prisma/client';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { AtGaurd } from 'src/common/guards';
import { multerAnyFilesConfig } from 'src/config/multer.config';

@ApiTags('Bid Reply')
@ApiBearerAuth()
@Controller({ path: 'bid-reply', version: '1' })
export class BidReplyController {
  constructor(private readonly bidReplyService: BidReplyService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @UseInterceptors(AnyFilesInterceptor(multerAnyFilesConfig)) // Accept multiple files
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add Bid Reply To Customers Bid' })
  @ApiResponse({ status: 201, description: 'Bid Reply added successfully' })
  @ApiResponse({ status: 404, description: 'Bid Request not found' })
  @ApiResponse({ status: 409, description: 'Vendor Not Found' })
  createBidReply(
    @Body() dto: CreateBidReplyDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.bidReplyService.createBidReply(dto, files);
  }

  @UseGuards(AtGaurd)
  @Get(':bidRequestId')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Get Bid Reply For Vendor Bid Request' })
  @ApiResponse({ status: 201, description: 'Bid Reply Retrived successfully' })
  @ApiResponse({ status: 404, description: 'Bid Reply Not Found' })
  getByBidRequestIdForVendor(
    @GetCurrentUserId('userId') userId: string,
    @Param('bidRequestId') bidRequestId: string
  ) {
    return this.bidReplyService.getByBidRequestIdForVendor(userId, bidRequestId);

  }


  @Get('bid-req/:bidRequestId')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get Bid Reply For Vendor Bid Request' })
  @ApiResponse({ status: 201, description: 'Bid Reply Retrived successfully' })
  @ApiResponse({ status: 404, description: 'Bid Reply Not Found' })
  getReplyByBidRequestIdForCustomer(
    @Param('bidRequestId') bidRequestId: string,
    @GetCurrentUser() caller: JwtPayload,
  ) {
    return this.bidReplyService.getReplyByBidRequestIdForCustomer(bidRequestId, caller);
  }


  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @UseInterceptors(AnyFilesInterceptor(multerAnyFilesConfig)) // Accept multiple files
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update Bid Reply To Customers Bid' })
  @ApiResponse({ status: 201, description: 'Bid Reply Updated successfully' })
  @ApiResponse({ status: 404, description: 'Bid Request not found' })
  @ApiResponse({ status: 409, description: 'Vendor Not Found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBidReplyDto,
    @GetCurrentUser() caller: JwtPayload,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.bidReplyService.update(id, dto, caller, files);
  }

}
