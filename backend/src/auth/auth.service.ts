import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload, SafeUser } from './auth.types';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const passwordHash = await bcrypt.hash('admin', 10);
    await this.prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@test.com',
        password: passwordHash,
        role: 'super_admin',
        status: 'active',
      },
    });
    this.logger.log(
      'Default admin user created (admin@test.com / admin). Change password in production.',
    );
  }

  private toSafeUser(user: {
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

  async validateUser(login: string, password: string): Promise<SafeUser> {
    const normalized = login.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: normalized, mode: 'insensitive' } },
          { email: { equals: normalized, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is disabled');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return this.toSafeUser(user);
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.username, dto.password);
    return this.buildAuthResponse(user);
  }

  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();

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

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        password: passwordHash,
        role: dto.role ?? 'user',
        status: 'active',
      },
    });

    return this.buildAuthResponse(this.toSafeUser(user));
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toSafeUser(user);
  }

  buildAuthResponse(user: SafeUser) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user,
    };
  }
}
