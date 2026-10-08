import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Customer } from './customer.entity';
import {
  LoginCustomerDto,
  RegisterCustomerDto,
  ResendOtpDto,
  VerifyOtpDto,
} from './customer.dto';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from '../auth/jwt.strategy';

const SALT_ROUNDS = 10;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    dto: RegisterCustomerDto,
  ): Promise<{ message: string; email: string }> {
    const existing = await this.findByEmailWithSecrets(dto.email);
    if (existing?.emailVerified) {
      throw new ConflictException(`Email ${dto.email} already exists`);
    }

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    let customerId: number;
    if (existing) {
      // Email đã đăng ký nhưng chưa xác thực (đăng ký dở hoặc bị người khác nhập nhầm):
      // cho đăng ký lại, ghi đè mật khẩu và gửi OTP mới.
      this.ensureResendCooldownPassed(existing);
      await this.customerRepository.update(existing.id, { password });
      customerId = existing.id;
    } else {
      try {
        const created = await this.customerRepository.save({
          email: dto.email,
          password,
        });
        customerId = created.id;
      } catch (error) {
        // Hai request đăng ký cùng email chạy song song: unique index chặn bản thứ hai.
        if (isDuplicateEntry(error)) {
          throw new ConflictException(`Email ${dto.email} already exists`);
        }
        throw error;
      }
    }

    await this.issueOtp(customerId, dto.email);
    return { message: 'OTP has been sent to your email', email: dto.email };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ access_token: string }> {
    const customer = await this.findByEmailWithSecrets(dto.email);
    if (
      !customer ||
      customer.emailVerified ||
      !customer.otpHash ||
      !customer.otpExpiresAt
    ) {
      throw new BadRequestException('No pending verification for this email');
    }
    if (customer.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many failed attempts, please request a new OTP',
      );
    }
    if (customer.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'OTP has expired, please request a new one',
      );
    }

    const otpMatches = await bcrypt.compare(dto.otp, customer.otpHash);
    if (!otpMatches) {
      await this.customerRepository.increment(
        { id: customer.id },
        'otpAttempts',
        1,
      );
      throw new BadRequestException('Invalid OTP');
    }

    // Bắt buộc khớp mật khẩu: nếu người khác đăng ký lại email này (ghi đè mật khẩu)
    // trong lúc chủ email đang xác thực, OTP đúng cũng không kích hoạt được
    // tài khoản mang mật khẩu của người kia.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      customer.password,
    );
    if (!passwordMatches) {
      throw new BadRequestException(
        'Password does not match the one used to register, please register again',
      );
    }

    await this.customerRepository.update(customer.id, {
      emailVerified: true,
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpSentAt: null,
    });
    return this.signToken(customer);
  }

  async resendOtp(
    dto: ResendOtpDto,
  ): Promise<{ message: string; email: string }> {
    const customer = await this.findByEmailWithSecrets(dto.email);
    if (!customer || customer.emailVerified) {
      throw new BadRequestException('No pending verification for this email');
    }
    this.ensureResendCooldownPassed(customer);

    await this.issueOtp(customer.id, customer.email);
    return { message: 'OTP has been sent to your email', email: dto.email };
  }

  async login(dto: LoginCustomerDto): Promise<{ access_token: string }> {
    const customer = await this.findByEmailWithSecrets(dto.email);
    if (!customer || !(await bcrypt.compare(dto.password, customer.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Kiểm tra sau mật khẩu để không lộ trạng thái xác thực của email cho người không biết mật khẩu.
    if (!customer.emailVerified) {
      throw new ForbiddenException('Email has not been verified');
    }
    return this.signToken(customer);
  }

  async findOne(id: number): Promise<Customer> {
    const customer = await this.customerRepository.findOneBy({ id });
    if (!customer) {
      throw new NotFoundException(`Customer with id ${id} not found`);
    }
    return customer;
  }

  private findByEmailWithSecrets(email: string): Promise<Customer | null> {
    return this.customerRepository
      .createQueryBuilder('customer')
      .addSelect([
        'customer.password',
        'customer.otpHash',
        'customer.otpExpiresAt',
        'customer.otpAttempts',
        'customer.otpSentAt',
      ])
      .where('customer.email = :email', { email })
      .getOne();
  }

  private ensureResendCooldownPassed(customer: Customer): void {
    if (!customer.otpSentAt) {
      return;
    }
    const elapsedSeconds = (Date.now() - customer.otpSentAt.getTime()) / 1000;
    if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(
        OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds,
      );
      throw new HttpException(
        `Please wait ${waitSeconds}s before requesting a new OTP`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // Ghi OTP mới vào DB trước rồi mới gửi mail; gửi lỗi thì xóa otpSentAt
  // để người dùng bấm gửi lại ngay, không phải chờ cooldown.
  private async issueOtp(customerId: number, email: string): Promise<void> {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = Date.now();
    await this.customerRepository.update(customerId, {
      otpHash: await bcrypt.hash(otp, SALT_ROUNDS),
      otpExpiresAt: new Date(now + OTP_TTL_MINUTES * 60_000),
      otpAttempts: 0,
      otpSentAt: new Date(now),
    });

    try {
      await this.mailService.sendOtp(email, otp, OTP_TTL_MINUTES);
    } catch (error) {
      this.logger.error(`Failed to send OTP to ${email}`, error);
      await this.customerRepository.update(customerId, { otpSentAt: null });
      throw new ServiceUnavailableException(
        'Could not send OTP email, please try again',
      );
    }
  }

  private async signToken(
    customer: Customer,
  ): Promise<{ access_token: string }> {
    const payload: JwtPayload = {
      sub: customer.id,
      email: customer.email,
      role: 'customer',
    };
    return { access_token: await this.jwtService.signAsync(payload) };
  }
}

function isDuplicateEntry(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      'ER_DUP_ENTRY'
  );
}
