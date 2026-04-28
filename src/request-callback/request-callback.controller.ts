import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { RequestCallbackService } from "./request-callback.service";
import { Public, Roles } from "src/common/decorators";
import { RequestCallbackDto } from "./dtos/request-callback.dto";
import { AtGaurd } from "src/common/guards";
import { PaginationDto } from "src/common/dto";

@Controller({
    path: "request-callback",
    version: '1'
})
export class RequestCallbackController{
    constructor(private readonly requestCallback: RequestCallbackService){}

    @Public()
    @Post()
    async request(@Body() dto: RequestCallbackDto){
        return await this.requestCallback.request(dto);
    }


    @UseGuards(AtGaurd)
    @Roles('ADMIN')
    @Get()
    async getAll(@Query() dto: PaginationDto){
        return await this.requestCallback.getAll(dto);
    }
}