import { Module } from '@nestjs/common';
import { GodaddyService } from './godaddy.service';

@Module({
  providers: [GodaddyService],
  exports: [GodaddyService],
})
export class GodaddyModule {}
