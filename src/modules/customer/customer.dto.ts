import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterCustomerDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @Matches(/@gmail\.com$/, { message: 'email must be a @gmail.com address' })
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
