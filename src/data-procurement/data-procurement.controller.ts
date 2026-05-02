import { Body, Controller, Post, Param, UseGuards } from '@nestjs/common';
import { DataProcurementService } from './data-procurement.service';
import { CreateRequestDto } from './dtos/create-request.dto';
import { GetCurrentUserId, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Data Procurement')
@ApiBearerAuth()
@Controller({
  path: 'data-procurement',
  version: '1',
})
export class DataProcurementController {
  constructor(private readonly dataProcurementService: DataProcurementService) {}

  @Roles(UserRole.VENDOR)
  @Post('requests')
  @ApiOperation({ summary: 'Create a new data procurement request' })
  createRequest(
    @GetCurrentUserId() userId: string,
    @Body() dto: CreateRequestDto,
  ) {
    return this.dataProcurementService.createRequest(userId, dto);
  }

  @Roles(UserRole.VENDOR)
  @Post('requests/:uid/coverage-check')
  @ApiOperation({ summary: 'Run coverage check for a request' })
  runCoverageCheck(@Param('uid') uid: string) {
    return this.dataProcurementService.runCoverageCheck(uid);
  }

  @Roles(UserRole.VENDOR)
  @Post('requests/:uid/quote')
  @ApiOperation({ summary: 'Generate a quote for a request' })
  generateQuote(@Param('uid') uid: string) {
    return this.dataProcurementService.generateQuote(uid);
  }
}
