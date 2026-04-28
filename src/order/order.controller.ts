import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { GetCurrentUser, GetCurrentUserId, Roles } from "src/common/decorators";
import { JwtPayload } from "src/auth/types";
import { AdminOrderReportDto, DisputeMilestoneDto, OrderDto, RedeemMilestoneOtpDto, ResolveMilestoneDto, UpdateOrderDto } from "./dtos/order.dto";
import { OrderService } from "./order.service";
import { PaginationDto } from "src/common/dto";
import { PrismaService } from "src/prisma/prisma.service";
import { AtGaurd } from "src/common/guards";
import { Response } from "express";

@ApiTags('Order')
@ApiBearerAuth()
@Controller({
    path: 'order',
    version: '1'
})
export class OrderController {
    constructor(private readonly orderService: OrderService,
        private readonly prisma: PrismaService
    ) { }


    @Post()
    @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
    @ApiOperation({ summary: 'Create Order' })
    @ApiResponse({ status: 200, description: 'Order Created Successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    create(
        @Body() dto: OrderDto,
        @GetCurrentUser() caller: JwtPayload,
    ) {
        return this.orderService.create(dto.bidReplyId, caller)
    }


    @Get("details/customer/:id")
    @Roles(UserRole.CUSTOMER)
    @ApiOperation({ summary: 'Get Order By Id For Customer' })
    @ApiResponse({ status: 200, description: 'Order Retrived successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getOrderByIdForCustomer(
        @Param("id") id: string,
        @GetCurrentUser() caller: JwtPayload,
    ) {
        return this.orderService.getOrderByIdForCustomer(id, caller)
    }


    @Get("details/vendor/:id")
    @Roles(UserRole.VENDOR)
    @ApiOperation({ summary: 'Get Order By Id For Customer' })
    @ApiResponse({ status: 200, description: 'Order Retrived successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getOrderByIdForVendor(
        @Param("id") id: string,
        @GetCurrentUser() caller: JwtPayload,
    ) {
        return this.orderService.getOrderByIdForVendor(id, caller)
    }


    @Get('vendor/:userId')
    @Roles(UserRole.ADMIN, UserRole.VENDOR)
    @ApiOperation({ summary: 'Get Order For Vendor' })
    @ApiResponse({ status: 200, description: 'Orders Retrived Successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getAllOrderForVendor(@Param('userId') userId: string,
        @Query() dto: PaginationDto,
        @GetCurrentUser() caller: JwtPayload,
    ) {
        // Non-admin vendors can only list their own orders. The path-param
        // userId must match the JWT subject, otherwise any vendor could
        // enumerate another vendor's book of work.
        const isAdmin = caller.role?.includes(UserRole.ADMIN);
        if (!isAdmin && userId !== caller.sub) {
            throw new ForbiddenException('You can only list your own orders');
        }

        const vendor = await this.prisma.vendor.findUnique({
            where: { userId },
            select: {
                id: true
            }
        })

        if (!vendor) {
            throw new NotFoundException('Vendor Not Found')
        }

        return this.orderService.getAllOrderForVendor(dto, vendor.id)
    }


    @Get('customer/:userId')
    @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
    @ApiOperation({ summary: 'Get Order For Customer' })
    @ApiResponse({ status: 200, description: 'Orders Retrived Successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getAllOrderForCustomer(@Param('userId') userId: string,
        @Query() dto: PaginationDto,
        @GetCurrentUser() caller: JwtPayload,
    ) {
        const isAdmin = caller.role?.includes(UserRole.ADMIN);
        if (!isAdmin && userId !== caller.sub) {
            throw new ForbiddenException('You can only list your own orders');
        }

        const customer = await this.prisma.customer.findUnique({
            where: { userId },
            select: {
                id: true
            }
        })

        if (!customer) {
            throw new NotFoundException("Customer Not Found")
        }

        return await this.orderService.getAllOrderForCustomer(dto, customer.id)
    }


    @Get()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Get Order For Vendor' })
    @ApiResponse({ status: 200, description: 'All Orders Retrived Successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getAll(@Query() dto: PaginationDto) {
        return this.orderService.getAll(dto)
    }


    @Get('report')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Get Order Report ' })
    @ApiResponse({ status: 200, description: 'All Orders Report retrived Successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getReport(@Query() dto: AdminOrderReportDto) {
        return this.orderService.getReport(dto)
    }


    @UseGuards(AtGaurd)
    @Get('report/export-csv')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Export CSV for order report for a time period' })
    @ApiResponse({ status: 200, description: 'Export CSV report generated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async bookingReportForPeriodExport(
        @Query() dto: AdminOrderReportDto,
        @Res() res: Response,
    ) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="booking-report-for-admin-${Date.now()}.csv"`,
        );

        try {
            await this.orderService.exportOrderReportCsv(dto, res);
            res.end();
        } catch (err) {
            console.error('CSV export failed', err);
            if (!res.headersSent) res.status(500).send('Export failed');
            else res.end();
        }
    }


    @Patch(":id")
    @Roles(UserRole.ADMIN, UserRole.VENDOR)
    @ApiOperation({ summary: 'Complete Order' })
    @ApiResponse({ status: 200, description: 'Order Completed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async completeOrder(
        @Param("id") id: string,
        @Body() dto: UpdateOrderDto,
        @GetCurrentUser() caller: JwtPayload,
    ) {
        return this.orderService.completeOrder(id, dto, caller)
    }


    @Get(":id")
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Get Order By Id' })
    @ApiResponse({ status: 200, description: 'Order Retrived successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getOrderById(
        @Param("id") id: string,
    ) {
        return this.orderService.getOrderById(id)
    }


    // ---------- Payments v2 — milestone lifecycle ----------
    // Both gated by PAYMENTS_V2_ENABLED (404 when off).

    @Post('milestone/:id/redeem')
    @Roles(UserRole.VENDOR)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Vendor redeems the customer OTP for a milestone (gated)' })
    @ApiResponse({ status: 200, description: 'Milestone completed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async redeemMilestoneOtp(
        @Param('id') milestoneId: string,
        @GetCurrentUserId() userId: string,
        @Body() dto: RedeemMilestoneOtpDto,
    ) {
        return this.orderService.redeemMilestoneOtp(milestoneId, userId, dto)
    }


    @Post('milestone/:id/dispute')
    @Roles(UserRole.CUSTOMER)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Customer raises a dispute on a paid milestone (gated)' })
    @ApiResponse({ status: 200, description: 'Milestone marked DISPUTED' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async disputeMilestone(
        @Param('id') milestoneId: string,
        @GetCurrentUserId() userId: string,
        @Body() dto: DisputeMilestoneDto,
    ) {
        return this.orderService.disputeMilestone(milestoneId, userId, dto)
    }


    @Post('milestone/:id/resolve')
    @Roles(UserRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Admin resolves a DISPUTED milestone (gated)' })
    @ApiResponse({ status: 200, description: 'Milestone resolved' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async resolveDispute(
        @Param('id') milestoneId: string,
        @Body() dto: ResolveMilestoneDto,
    ) {
        return this.orderService.resolveDispute(milestoneId, dto)
    }

}