import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { InvitationModule } from './modules/invitation/invitation.module';
import { CategoryModule } from './modules/category/category.module';
import { EventModule } from './modules/event/event.module';
import { CustomerModule } from './modules/customer/customer.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';

@Module({
  imports: [
    UserModule,
    AuthModule,
    InvitationModule,
    CategoryModule,
    EventModule,
    CustomerModule,
    TypeOrmModule.forRoot(dataSourceOptions),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
