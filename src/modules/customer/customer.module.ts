import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './customer.entity';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  // AuthModule export JwtModule: customer ký token bằng cùng secret với admin.
  imports: [TypeOrmModule.forFeature([Customer]), AuthModule, MailModule],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
