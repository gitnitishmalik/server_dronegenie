import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';


// Single source of truth for feature flags the FE needs at runtime.
// The FE fetches this once on app mount and caches it. Flipping a flag
// in server/.env + a restart is enough to roll out or roll back a feature
// — no FE rebuild needed.
@ApiTags('Config')
@Controller({ path: 'config', version: '1' })
export class PublicConfigController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public runtime configuration / feature flags' })
  get() {
    return {
      paymentsV2Enabled: this.config.get<string>('PAYMENTS_V2_ENABLED') === 'true',
    };
  }
}
