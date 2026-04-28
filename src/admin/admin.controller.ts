import { Controller, Get, Query } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { Roles } from "src/common/decorators";
import { UserRole } from "@prisma/client";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { QueryFilterDto } from "./dtos/admin.dto";

@Controller({
    path: "admin",
    version: "1"
})
export class AdminController{
    constructor(private readonly adminService: AdminService){}

    @Get("summary")
    @Roles(UserRole.ADMIN)
    @ApiOperation({summary: "Get Summary For Admin"})
    @ApiResponse({status: 200, description: "Admin Summary Retrived Successfully"})
    @ApiResponse({status: 403, description: "Forbidden"})
    async getSummery(@Query() dto: QueryFilterDto){
        return await this.adminService.summary(dto)
    }



    @Get("monthly-order")
    @Roles(UserRole.ADMIN)
    @ApiOperation({summary: "Get orders For Admin"})
    @ApiResponse({status: 200, description: "Admin orders Retrived Successfully"})
    @ApiResponse({status: 403, description: "Forbidden"})
    async getMonthlyOrders(@Query() dto: QueryFilterDto){
        return await this.adminService.getMonthlyOrders(dto)
    }



    @Get("monthly-revenue")
    @Roles(UserRole.ADMIN)
    @ApiOperation({summary: "Get orders For Admin"})
    @ApiResponse({status: 200, description: "Admin orders Retrived Successfully"})
    @ApiResponse({status: 403, description: "Forbidden"})
    async getMonthlyRevenue(@Query() dto: QueryFilterDto){
        return await this.adminService.getMonthlyRevenue(dto)
    }

}