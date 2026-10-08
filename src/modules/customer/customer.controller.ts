import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { Customer } from './customer.entity';
import {
  LoginCustomerDto,
  RegisterCustomerDto,
  ResendOtpDto,
  VerifyOtpDto,
} from './customer.dto';
import { Auth } from '../auth/auth.decorator';
import { JwtPayload } from '../auth/jwt.strategy';

// register / verify-otp / resend-otp / login là public; /me chỉ cho token customer.
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post('register')
  @UsePipes(new ValidationPipe({ transform: true }))
  register(
    @Body() dto: RegisterCustomerDto,
  ): Promise<{ message: string; email: string }> {
    return this.customerService.register(dto);
  }

  @Post('verify-otp')
  @UsePipes(new ValidationPipe({ transform: true }))
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<{ access_token: string }> {
    return this.customerService.verifyOtp(dto);
  }

  @Post('resend-otp')
  @UsePipes(new ValidationPipe({ transform: true }))
  resendOtp(
    @Body() dto: ResendOtpDto,
  ): Promise<{ message: string; email: string }> {
    return this.customerService.resendOtp(dto);
  }

  @Post('login')
  @UsePipes(new ValidationPipe({ transform: true }))
  login(@Body() dto: LoginCustomerDto): Promise<{ access_token: string }> {
    return this.customerService.login(dto);
  }

  @Auth('customer')
  @Get('me')
  getMe(@Req() req: { user: JwtPayload }): Promise<Customer> {
    return this.customerService.findOne(req.user.sub);
  }
}
