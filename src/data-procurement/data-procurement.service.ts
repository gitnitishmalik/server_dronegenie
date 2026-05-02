import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRequestDto } from './dtos/create-request.dto';
import { SensorClass, Season, RequestState, QualityTier } from '@prisma/client';

@Injectable()
export class DataProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  private computeSeason(dateIso: string): Season {
    const d = new Date(dateIso);
    const m = d.getMonth() + 1; // 1-12
    if (m >= 12 || m <= 2) return 'WINTER';
    if (m >= 3 && m <= 5) return 'SUMMER';
    if (m >= 6 && m <= 9) return 'MONSOON';
    return 'POST_MONSOON';
  }

  async createRequest(userId: string, dto: CreateRequestDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const seasonTag = this.computeSeason(dto.captureDate);
    
    // In a real app, we'd calculate area from the polygon. 
    // For now, we'll use a placeholder or 1.0 if not easily calculable.
    const areaKm2 = 1.0; 

    const request = await this.prisma.dataProcurementRequest.create({
      data: {
        vendorId: vendor.id,
        boundaryGeom: dto.boundary,
        areaKm2,
        sensorClass: dto.sensorClass,
        sensorModel: dto.sensorModel,
        captureDate: new Date(dto.captureDate),
        claimedGsdCm: dto.claimedGsdCm,
        positionalAccuracyM: dto.positionalAccuracyM,
        crsCode: dto.crsCode,
        seasonTag,
        processingLevel: dto.processingLevel,
        weatherNotes: dto.weatherNotes,
        state: RequestState.DRAFT,
      },
    });

    return request;
  }

  async runCoverageCheck(requestUid: string) {
    const request = await this.prisma.dataProcurementRequest.findUnique({
      where: { requestUid },
    });
    if (!request) throw new NotFoundException('Request not found');

    // Return the CoverageCheckResult DTO shape the frontend expects
    const result = {
      iou: 0,
      outcome: 'NO_OVERLAP',
      conflictingInventoryIds: [],
      checkedAt: new Date(),
    };

    await this.prisma.dataProcurementRequest.update({
      where: { id: request.id },
      data: {
        coverageCheckResult: result as any,
      },
    });

    return result;
  }

  async generateQuote(requestUid: string) {
    const request = await this.prisma.dataProcurementRequest.findUnique({
      where: { requestUid },
    });
    if (!request) throw new NotFoundException('Request not found');

    // Mock quote data
    const quoteAmountInr = 500000; // 5000 INR in paise
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);
    
    const quoteData = {
      quoteAmountInr,
      qualityEstimate: 0.85,
      qualityTierEstimate: QualityTier.A,
      discountPctEstimate: 0,
      quoteIssuedAt: new Date(),
      quoteExpiresAt: expiresAt,
      state: RequestState.QUOTED,
    };

    await this.prisma.dataProcurementRequest.update({
      where: { id: request.id },
      data: quoteData,
    });

    // Return the Quote DTO shape the frontend expects (FRD Appendix B.2)
    return {
      quoteId: request.id,
      requestUid: request.requestUid,
      areaKm2: Number(request.areaKm2),
      rateInrPerKm2: 500000, 
      qualityEstimate: { score: 0.85, tier: 'A' },
      discountPct: 0,
      grossAmountInr: quoteAmountInr,
      tdsRateBps: 200,
      tdsAmountInr: 10000,
      netAmountInr: 490000,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
