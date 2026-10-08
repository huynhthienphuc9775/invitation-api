import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

// Khách hàng tự đăng ký bằng Gmail, tách hẳn khỏi `User` (admin).
// Các cột bí mật để `select: false`: query mặc định không trả về, cần addSelect khi dùng.
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  // false cho tới khi nhập đúng OTP; chưa xác thực thì không đăng nhập được.
  @Column({ default: false })
  emailVerified: boolean;

  // Lưu hash bcrypt của OTP, không lưu mã gốc.
  @Column({ type: 'varchar', nullable: true, select: false })
  otpHash: string | null;

  @Column({ type: 'datetime', nullable: true, select: false })
  otpExpiresAt: Date | null;

  @Column({ default: 0, select: false })
  otpAttempts: number;

  @Column({ type: 'datetime', nullable: true, select: false })
  otpSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
