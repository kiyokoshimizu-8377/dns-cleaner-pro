import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SafeUser } from '../auth/auth.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private toSafe(user: {
    id: string;
    username: string;
    email: string;
    role: string;
    status: string;
  }): SafeUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  findAll() {
    return this.prisma.user
      .findMany({ orderBy: { createdAt: 'asc' } })
      .then((users) => users.map((u) => this.toSafe(u)));
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    role?: string;
  }) {
    const username = data.username.trim();
    const email = data.email.trim().toLowerCase();

    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          { email },
        ],
      },
    });
    if (exists) {
      throw new ConflictException('Username or email already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        password: await bcrypt.hash(data.password, 10),
        role: data.role ?? 'user',
        status: 'active',
      },
    });
    return this.toSafe(user);
  }

  async update(
    id: string,
    data: Partial<{
      username: string;
      email: string;
      password: string;
      role: string;
      status: string;
    }>,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updateData: {
      username?: string;
      email?: string;
      password?: string;
      role?: string;
      status?: string;
    } = {};

    if (data.username) updateData.username = data.username.trim();
    if (data.email) updateData.email = data.email.trim().toLowerCase();
    if (data.role) updateData.role = data.role;
    if (data.status) updateData.status = data.status;
    if (data.password?.trim()) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    return this.toSafe(user);
  }

  async remove(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.role === 'super_admin') {
      const superCount = await this.prisma.user.count({
        where: { role: 'super_admin' },
      });
      if (superCount <= 1) {
        throw new ConflictException('Cannot delete the last super admin');
      }
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted' };
  }
}
