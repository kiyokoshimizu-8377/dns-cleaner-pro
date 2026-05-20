import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SyncService } from '../sync/sync.service';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly syncService: SyncService,
  ) {}

  @Post()
  create(@Body() createAccountDto: CreateAccountDto) {
    return this.accountsService.create(createAccountDto);
  }

  @Post(':id/sync')
  async sync(@Param('id') id: string) {
    try {
      return await this.syncService.syncAccount(id);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Post(':id/deep-sync')
  async deepSync(@Param('id') id: string) {
    try {
      return await this.syncService.deepSyncAccount(id);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  findAll() {
    return this.accountsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAccountDto: UpdateAccountDto) {
    return this.accountsService.update(id, updateAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accountsService.remove(id);
  }
}
