import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CustomerService, OTP_MAX_ATTEMPTS } from './customer.service';
import { Customer } from './customer.entity';

// Lấy tham số thứ `arg` của lần gọi thứ `call` (mock.calls mặc định có kiểu any).
const callArg = <T>(mock: jest.Mock, call: number, arg: number): T =>
  (mock.mock.calls as unknown[][])[call][arg] as T;

describe('CustomerService', () => {
  let service: CustomerService;
  let found: Customer | null;
  let repo: {
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    increment: jest.Mock;
    findOneBy: jest.Mock;
    findAndCount: jest.Mock;
    delete: jest.Mock;
  };
  let mail: { sendOtp: jest.Mock };
  let jwt: { signAsync: jest.Mock };

  const makeCustomer = async (
    overrides: Partial<Customer> = {},
  ): Promise<Customer> => ({
    id: 1,
    email: 'a@gmail.com',
    password: await bcrypt.hash('password123', 4),
    emailVerified: false,
    otpHash: await bcrypt.hash('123456', 4),
    otpExpiresAt: new Date(Date.now() + 60_000),
    otpAttempts: 0,
    otpSentAt: new Date(Date.now() - 120_000),
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    found = null;
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(found)),
    };
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      save: jest.fn((c: Partial<Customer>) => Promise.resolve({ id: 7, ...c })),
      update: jest.fn(() => Promise.resolve()),
      increment: jest.fn(() => Promise.resolve()),
      findOneBy: jest.fn(),
      findAndCount: jest.fn(() => Promise.resolve([[], 25])),
      delete: jest.fn(() => Promise.resolve()),
    };
    mail = { sendOtp: jest.fn(() => Promise.resolve()) };
    jwt = { signAsync: jest.fn(() => Promise.resolve('token')) };
    service = new CustomerService(repo as never, mail as never, jwt as never);
  });

  describe('register', () => {
    it('creates an unverified customer and mails a 6-digit OTP', async () => {
      const result = await service.register({
        email: 'new@gmail.com',
        password: 'password123',
      });

      expect(result.email).toBe('new@gmail.com');
      const saved = callArg<Customer>(repo.save, 0, 0);
      expect(saved.password).not.toBe('password123');
      const [to, otp] = mail.sendOtp.mock.calls[0] as [string, string];
      expect(to).toBe('new@gmail.com');
      expect(otp).toMatch(/^\d{6}$/);
      const stored = callArg<Customer>(repo.update, 0, 1);
      expect(await bcrypt.compare(otp, stored.otpHash!)).toBe(true);
    });

    it('rejects an email that is already verified', async () => {
      found = await makeCustomer({ emailVerified: true });
      await expect(
        service.register({ email: 'a@gmail.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-registers an unverified email by overwriting its password', async () => {
      found = await makeCustomer();
      await service.register({ email: 'a@gmail.com', password: 'newpass123' });

      expect(repo.save).not.toHaveBeenCalled();
      const changes = callArg<Customer>(repo.update, 0, 1);
      expect(await bcrypt.compare('newpass123', changes.password)).toBe(true);
      expect(mail.sendOtp).toHaveBeenCalled();
    });

    it('enforces the resend cooldown', async () => {
      found = await makeCustomer({ otpSentAt: new Date() });
      const error = await service
        .register({ email: 'a@gmail.com', password: 'password123' })
        .catch((e: HttpException) => e);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(mail.sendOtp).not.toHaveBeenCalled();
    });

    it('clears otpSentAt when the email fails to send', async () => {
      mail.sendOtp.mockRejectedValue(new Error('smtp down'));
      await expect(
        service.register({ email: 'new@gmail.com', password: 'password123' }),
      ).rejects.toThrow('Could not send OTP email');
      expect(repo.update).toHaveBeenLastCalledWith(7, { otpSentAt: null });
    });
  });

  describe('verifyOtp', () => {
    const dto = {
      email: 'a@gmail.com',
      otp: '123456',
      password: 'password123',
    };

    it('activates the account and returns a customer token', async () => {
      found = await makeCustomer();
      await expect(service.verifyOtp(dto)).resolves.toEqual({
        access_token: 'token',
      });
      expect(repo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ emailVerified: true, otpHash: null }),
      );
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 1,
        email: 'a@gmail.com',
        role: 'customer',
      });
    });

    it('counts a wrong OTP as a failed attempt', async () => {
      found = await makeCustomer();
      await expect(
        service.verifyOtp({ ...dto, otp: '000000' }),
      ).rejects.toThrow('Invalid OTP');
      expect(repo.increment).toHaveBeenCalledWith({ id: 1 }, 'otpAttempts', 1);
    });

    it('locks out after too many attempts', async () => {
      found = await makeCustomer({ otpAttempts: OTP_MAX_ATTEMPTS });
      await expect(service.verifyOtp(dto)).rejects.toThrow(
        'Too many failed attempts',
      );
    });

    it('rejects an expired OTP', async () => {
      found = await makeCustomer({ otpExpiresAt: new Date(Date.now() - 1) });
      await expect(service.verifyOtp(dto)).rejects.toThrow('expired');
    });

    it('rejects a correct OTP when the password was overwritten by someone else', async () => {
      found = await makeCustomer();
      await expect(
        service.verifyOtp({ ...dto, password: 'someone-else' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'a@gmail.com', password: 'password123' };

    it('returns a token for a verified customer', async () => {
      found = await makeCustomer({ emailVerified: true });
      await expect(service.login(dto)).resolves.toEqual({
        access_token: 'token',
      });
    });

    it('rejects a wrong password', async () => {
      found = await makeCustomer({ emailVerified: true });
      await expect(
        service.login({ ...dto, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unverified customer', async () => {
      found = await makeCustomer();
      await expect(service.login(dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('findAll', () => {
    it('filters by email and verification status and paginates', async () => {
      const result = await service.findAll({
        search: 'gmail',
        emailVerified: false,
        page: 2,
        limit: 10,
      });

      const options = callArg<{
        where: Record<string, unknown>;
        skip: number;
        take: number;
      }>(repo.findAndCount, 0, 0);
      expect(options.where.emailVerified).toBe(false);
      expect(options.where.email).toBeDefined();
      expect(options.skip).toBe(10);
      expect(result).toEqual({
        data: [],
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('applies no filters when none are given', async () => {
      await service.findAll({ page: 1, limit: 10 });
      const options = callArg<{ where: object }>(repo.findAndCount, 0, 0);
      expect(options.where).toEqual({});
    });
  });

  describe('remove', () => {
    it('deletes an existing customer', async () => {
      repo.findOneBy.mockResolvedValue(await makeCustomer());
      await service.remove(1);
      expect(repo.delete).toHaveBeenCalledWith(1);
    });

    it('returns 404 for an unknown id without deleting', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
