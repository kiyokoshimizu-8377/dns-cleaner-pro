import { Injectable } from '@nestjs/common';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  omitUnchangedSecrets,
  sanitizeAccount,
} from '../common/sanitize-account';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  create(createAccountDto: CreateAccountDto) {
    return this.prisma.account
      .create({
        data: createAccountDto,
      })
      .then(sanitizeAccount);
  }

  async findAll() {
    const accounts = await this.prisma.account.findMany({
      include: { _count: { select: { domains: true } } },
    });
    return accounts.map(sanitizeAccount);
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { domains: true },
    });
    return sanitizeAccount(account);
  }

  update(id: string, updateAccountDto: UpdateAccountDto) {
    const data = omitUnchangedSecrets(updateAccountDto);
    return this.prisma.account
      .update({
        where: { id },
        data,
      })
      .then(sanitizeAccount);
  }

  remove(id: string) {
    return this.prisma.account.delete({
      where: { id },
    });
  }
}
