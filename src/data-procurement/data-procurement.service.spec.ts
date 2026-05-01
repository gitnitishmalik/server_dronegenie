import { Test, TestingModule } from '@nestjs/testing';
import { DataProcurementService } from './data-procurement.service';

describe('DataProcurementService', () => {
  let service: DataProcurementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataProcurementService],
    }).compile();

    service = module.get<DataProcurementService>(DataProcurementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
