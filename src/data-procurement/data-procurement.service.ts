import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRequestDto } from './dtos/create-request.dto';
import {
  Season,
  RequestState,
  QualityTier,
  ResolutionTier,
  GsdTier,
} from '@prisma/client';

@Injectable()
export class DataProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- helpers ---------------------------------------------------------

  private computeSeason(dateIso: string): Season {
    const m = new Date(dateIso).getMonth() + 1;
    if (m === 12 || m <= 2) return 'WINTER';
    if (m <= 5) return 'SUMMER';
    if (m <= 9) return 'MONSOON';
    return 'POST_MONSOON';
  }

  // FRD Appendix C.1
  private resolutionTierForGsd(gsdCm: number): ResolutionTier {
    if (gsdCm < 2) return 'ULTRA_HIGH';
    if (gsdCm <= 5) return 'HIGH';
    if (gsdCm <= 15) return 'MEDIUM';
    return 'STANDARD';
  }

  // FRD Appendix C.2
  private gsdTierForRmse(rmseM: number): GsdTier {
    if (rmseM < 0.1) return 'SURVEY_GRADE';
    if (rmseM <= 0.5) return 'MAPPING_GRADE';
    if (rmseM <= 2.0) return 'INSPECTION_GRADE';
    return 'RECONNAISSANCE';
  }

  // Spherical-excess area for a GeoJSON Polygon, in km².
  // Mirrors the formula used by @turf/area; WGS-84 sphere, R = 6 378 137 m.
  private polygonAreaKm2(geom: any): number {
    if (!geom || geom.type !== 'Polygon' || !Array.isArray(geom.coordinates)) {
      throw new BadRequestException('boundary must be a GeoJSON Polygon');
    }
    const R = 6_378_137;
    const toRad = (d: number) => (d * Math.PI) / 180;

    const ringAreaM2 = (ring: number[][]): number => {
      if (ring.length < 4) return 0;
      let total = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];
        total +=
          toRad(lon2 - lon1) *
          (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
      }
      return Math.abs((total * R * R) / 2);
    };

    const [outer, ...holes] = geom.coordinates;
    let m2 = ringAreaM2(outer);
    for (const h of holes) m2 -= ringAreaM2(h);
    return m2 / 1_000_000;
  }

  // ---- endpoints -------------------------------------------------------

  async createRequest(userId: string, dto: CreateRequestDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const seasonTag = this.computeSeason(dto.captureDate);
    const areaKm2 = this.polygonAreaKm2(dto.boundary);
    if (areaKm2 <= 0) {
      throw new BadRequestException('Boundary encloses zero area');
    }

    return this.prisma.dataProcurementRequest.create({
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
  }

  async runCoverageCheck(requestUid: string) {
    const request = await this.prisma.dataProcurementRequest.findUnique({
      where: { requestUid },
    });
    if (!request) throw new NotFoundException('Request not found');

    // Native Mongo $geoIntersects against the 2dsphere-indexed inventory.
    // Scoped to the same sensor class so we only flag genuinely-redundant
    // overlap, not e.g. RGB on top of an existing thermal capture.
    const raw = (await this.prisma.$runCommandRaw({
      find: 'imagery_inventory',
      filter: {
        sensorClass: request.sensorClass,
        extentGeom: {
          $geoIntersects: { $geometry: request.boundaryGeom as any },
        },
      },
      projection: { _id: 1 },
      limit: 100,
    })) as any;

    const ids: string[] =
      raw?.cursor?.firstBatch?.map((d: any) => String(d._id?.$oid ?? d._id)) ??
      [];

    // Phase-1 outcome: any intersection ⇒ OVERLAP. Exact IoU needs
    // polygon-intersection area, which we'll add when @turf/intersect
    // (or postgis) lands; for now IoU is a coarse 0/1 signal.
    const result = {
      iou: ids.length > 0 ? 1 : 0,
      outcome: ids.length > 0 ? 'OVERLAP' : 'NO_OVERLAP',
      conflictingInventoryIds: ids,
      checkedAt: new Date(),
    };

    await this.prisma.dataProcurementRequest.update({
      where: { id: request.id },
      data: { coverageCheckResult: result as any },
    });
    return result;
  }

  async generateQuote(requestUid: string) {
    const request = await this.prisma.dataProcurementRequest.findUnique({
      where: { requestUid },
    });
    if (!request) throw new NotFoundException('Request not found');

    const resolutionTier = this.resolutionTierForGsd(request.claimedGsdCm);
    const gsdTier = this.gsdTierForRmse(request.positionalAccuracyM);

    const rate = await this.prisma.imageryCeilingRate.findFirst({
      where: {
        sensorClass: request.sensorClass,
        resolutionTier,
        gsdTier,
        season: request.seasonTag,
        active: true,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!rate) {
      throw new BadRequestException(
        `No active ceiling rate for ${request.sensorClass}/${resolutionTier}/` +
          `${gsdTier}/${request.seasonTag}. Run prisma/seed/seed-ceiling-rates.ts.`,
      );
    }

    // Phase-1 quality assumption: real score arrives post-inspection (FRD §9.6).
    const qualityEstimate = 0.85;
    const qualityTierEstimate: QualityTier = QualityTier.A;
    const discountPctEstimate = 0;

    // rate.rateInrPerKm2 is stored in PAISE (FRD §9.1). All maths in paise.
    const grossPaise = Math.round(
      rate.rateInrPerKm2 * request.areaKm2 * (1 - discountPctEstimate),
    );
    const tdsRateBps = 200; // 2% TDS, FRD §9.8
    const tdsPaise = Math.round((grossPaise * tdsRateBps) / 10_000);
    const netPaise = grossPaise - tdsPaise;

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 72 * 3600 * 1000);

    await this.prisma.dataProcurementRequest.update({
      where: { id: request.id },
      data: {
        quoteAmountInr: grossPaise,
        ceilingRateId: rate.id,
        qualityEstimate,
        qualityTierEstimate,
        discountPctEstimate,
        quoteIssuedAt: issuedAt,
        quoteExpiresAt: expiresAt,
        state: RequestState.QUOTED,
      },
    });

    return {
      quoteId: request.id,
      requestUid: request.requestUid,
      areaKm2: Number(request.areaKm2),
      rateInrPerKm2: rate.rateInrPerKm2,
      qualityEstimate: { score: qualityEstimate, tier: qualityTierEstimate },
      discountPct: discountPctEstimate,
      grossAmountInr: grossPaise,
      tdsRateBps,
      tdsAmountInr: tdsPaise,
      netAmountInr: netPaise,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
