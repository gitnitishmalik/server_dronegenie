import { Test, TestingModule } from '@nestjs/testing';
import { DataProcurementController } from './data-procurement.controller';

describe('DataProcurementController', () => {
  let controller: DataProcurementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataProcurementController],
    }).compile();

    controller = module.get<DataProcurementController>(DataProcurementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
