import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';

@Controller('domains')
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get()
  findAll() {
    return this.domainsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.domainsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.domainsService.remove(id);
  }

  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.domainsService.syncDomainRecords(id);
  }

  @Post(':id/mass-delete')
  massDelete(@Param('id') id: string, @Body('types') types?: string[]) {
    return this.domainsService.massDeleteRecords(id, types);
  }

  @Post('bulk-mass-delete')
  async bulkMassDelete(
    @Body('domainNames') domainNames: string[],
    @Body('types') types?: string[],
  ) {
    return this.domainsService.bulkMassDelete(domainNames, types);
  }

  @Get('jobs/active')
  async getActiveJobs() {
    return this.domainsService.getActiveJobs();
  }

  @Get('jobs/status')
  async getQueueStatus() {
    return this.domainsService.getQueueMetrics();
  }

  @Post('jobs/cancel/:batchId')
  async cancelBatch(@Param('batchId') batchId: string) {
    return this.domainsService.cancelBatch(batchId);
  }

  @Post('jobs/pause')
  async pauseQueue() {
    return this.domainsService.pauseQueue();
  }

  @Post('jobs/resume')
  async resumeQueue() {
    return this.domainsService.resumeQueue();
  }

  @Get('jobs/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.domainsService.getJobStatus(jobId);
  }
}
