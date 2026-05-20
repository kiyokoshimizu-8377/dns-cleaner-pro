import { Controller, Post, Body, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { AutoOnboardingService } from './auto-onboarding.service';
import { StartOnboardingDto } from './dto/start-onboarding.dto';

@Controller('auto-onboarding')
export class AutoOnboardingController {
  constructor(private readonly onboardingService: AutoOnboardingService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startOnboarding(@Body() dto: StartOnboardingDto) {
    return this.onboardingService.startOnboarding(dto);
  }

  @Get('registrar-domains/:accountId')
  async getRegistrarDomains(@Param('accountId') accountId: string) {
    return this.onboardingService.getRegistrarDomains(accountId);
  }
}
