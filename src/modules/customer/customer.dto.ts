import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterCustomerDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  // bcrypt chỉ dùng 72 byte đầu, nên giới hạn để tránh phần thừa bị bỏ qua âm thầm.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class VerifyOtpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'otp must be 6 digits' })
  otp: string;

  // Mật khẩu đã nhập lúc đăng ký (FE giữ lại từ form). Xem CustomerService.verifyOtp.
  @IsString()
  password: string;
}

export class ResendOtpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;
}

export class LoginCustomerDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class QueryCustomerDto {
  // Tìm gần đúng theo email.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}
