import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SeoMetaService } from "./seo-meta.service";
import { Public, Roles } from "src/common/decorators";
import { ApiOperation } from "@nestjs/swagger";
import { CreateMetaDto, UpdateMetaDto } from "./dtos/seo-meta.dto";
import { PaginationDto } from "src/common/dto";
import { AtGaurd } from "src/common/guards";

@Controller({
    path: 'seo-meta',
    version: '1'
})
export class SeoMetaController {
    constructor(private readonly seoMetaService: SeoMetaService) { }


    @UseGuards(AtGaurd)
    @Roles('ADMIN')
    @Post()
    @ApiOperation({ summary: "Create Seo Meta" })
    async create(@Body() dto: CreateMetaDto) {
        return await this.seoMetaService.create(dto)
    }


    @UseGuards(AtGaurd)
    @Roles('ADMIN')
    @Get()
    @ApiOperation({ summary: "List Permissions" })
    async getAll(@Query() dto: PaginationDto) {
        return await this.seoMetaService.getAll(dto)
    }


    @Public()
    @Get(':page')
    @ApiOperation({ summary: "Get Meta" })
    async getById(@Param('page') page: string) {
        return await this.seoMetaService.getById(page)
    }



    @UseGuards(AtGaurd)
    @Roles('ADMIN')
    @Patch(':id')
    @ApiOperation({ summary: "Update Meta" })
    async update(@Param('id') id: string, @Body() dto: UpdateMetaDto) {
        return await this.seoMetaService.update(dto, id)
    }


    @UseGuards(AtGaurd)
    @Roles('ADMIN')
    @Delete(':id')
    @ApiOperation({ summary: "Delete Meta" })
    async delete(@Param('id') id: string) {
        return await this.seoMetaService.delete(id)
    }
}