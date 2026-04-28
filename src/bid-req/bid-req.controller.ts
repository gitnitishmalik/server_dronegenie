import { Controller, Post, UseInterceptors, Body, Param, UseGuards, UploadedFiles, Get, Query, NotFoundException } from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { CreateBidRequestDto } from "./dtos"; // Use full path
import { Roles, Public } from 'src/common/decorators';
import { BidStatus, UserRole } from "@prisma/client";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { BidRequestService } from "./bid-req.service";
import { AuthGuard } from "@nestjs/passport";
import { PaginationDto } from "src/common/dto";
import { PrismaService } from "src/prisma/prisma.service";
import { multerAnyFilesConfig } from "src/config/multer.config";


@ApiTags('Bid Request')
@ApiBearerAuth()
@Controller({
    path: 'bid-request',
    version: '1'
})
export class BidRequestController {
    constructor(private readonly bidRequestService: BidRequestService,
        private readonly prisma: PrismaService
    ) { }

    @Post(':userId')
    @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
    @UseInterceptors(AnyFilesInterceptor(multerAnyFilesConfig))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Create Bid Request' })
    requestBid(
        @Body() dto: CreateBidRequestDto,
        @Param('userId') userId: string,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        return this.bidRequestService.createBidRequest(dto, userId, files);
    }


    @Get('customer/landing/:userId')
    @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
    @ApiOperation({ summary: 'Get All Bid Request' })
    @ApiResponse({ status: 200, description: 'Customer Bid Request retrieved' })
    @ApiResponse({ status: 404, description: 'Customer Bid Request not found' })
    async getBidRequestForHomePage(
        @Query() dto: PaginationDto,
        @Param('userId') userId: string
    ) {
        const customer = await this.prisma.customer.findUnique({
            where: { userId },
            select: {id: true}
        });

        if (!customer) {
            throw new NotFoundException('Customer Not Found');
        }
        return this.bidRequestService.getBidRequestForHomePage(dto, customer.id)
    }


    @Get('vendor/:userId')
    @Roles(UserRole.ADMIN, UserRole.VENDOR)
    @ApiOperation({ summary: 'Get Bid Request' })
    @ApiResponse({ status: 200, description: 'Vendor Bid Request retrieved' })
    @ApiResponse({ status: 404, description: 'Vendor Bid Request not found' })
    async getBidRequest(
        @Query() dto: PaginationDto,
        @Param('userId') userId: string
    ) {
        const vendor = await this.prisma.vendor.findUnique({
            where: { userId },
            select: {
                id: true
            }
        })

        if (!vendor) {
            throw new NotFoundException('Vendor Not Found')
        }

        return this.bidRequestService.getBidRequest(dto, vendor.id)
    }


    @Get('customer/:userId')
    @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
    @ApiOperation({ summary: 'Get Open Bid Request' })
    @ApiResponse({ status: 200, description: 'Customer Bid Request retrieved' })
    @ApiResponse({ status: 404, description: 'Customer Bid Request not found' })
    async getBidRequestForCustomer(
        @Query() dto: PaginationDto,
        @Param('userId') userId: string
    ) {
        const customer = await this.prisma.customer.findUnique({
            where: { userId: userId },
            select: {id: true}
        })
        if(!customer) throw new NotFoundException("Customer not found");
        return this.bidRequestService.getBidRequestForCustomer(dto, customer?.id)
    }


    @Get()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Get all BidRequests' })
    @ApiResponse({ status: 200, description: 'BidRequests retrieved successfully' })
    async getAll(@Query() dto: PaginationDto) {
        return this.bidRequestService.getAll(dto);
    }


    
}