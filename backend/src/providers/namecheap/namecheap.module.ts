import { Module } from '@nestjs/common';
import { NamecheapService } from './namecheap.service';

@Module({
  providers: [NamecheapService],
  exports: [NamecheapService],
})
export class NamecheapModule {}
