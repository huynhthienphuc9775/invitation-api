import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string | undefined;

  constructor() {
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASSWORD;
    const port = Number(process.env.MAIL_PORT) || 465;
    // Gmail SMTP: MAIL_PASSWORD là App Password của tài khoản Google, không phải mật khẩu đăng nhập.
    this.transporter =
      user && pass
        ? createTransport({
            host: process.env.MAIL_HOST ?? 'smtp.gmail.com',
            port,
            secure: port === 465,
            auth: { user, pass },
          })
        : null;
    this.from = process.env.MAIL_FROM ?? user;
  }

  async sendOtp(to: string, otp: string, ttlMinutes: number): Promise<void> {
    if (!this.transporter) {
      // Chưa cấu hình SMTP: ở dev in OTP ra log để test, ở production thì báo lỗi.
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MAIL_USER / MAIL_PASSWORD are not configured');
      }
      this.logger.warn(`SMTP not configured, OTP for ${to}: ${otp}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Mã xác thực đăng ký tài khoản',
      text: `Mã xác thực của bạn là ${otp}. Mã có hiệu lực trong ${ttlMinutes} phút. Không chia sẻ mã này cho bất kỳ ai.`,
      html: `<p>Mã xác thực của bạn là:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>Mã có hiệu lực trong ${ttlMinutes} phút. Không chia sẻ mã này cho bất kỳ ai.</p>`,
    });
  }
}
