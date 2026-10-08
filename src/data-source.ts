import 'dotenv/config';
import { DataSourceOptions } from 'typeorm';
import { User } from './modules/user/user.entity';
import { Invitation } from './modules/invitation/invitation.entity';
import { Category } from './modules/category/category.entity';
import { Event } from './modules/event/event.entity';
import { Customer } from './modules/customer/customer.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USERNAME ?? 'dev',
  password: process.env.DB_PASSWORD ?? 'dev123',
  database: process.env.DB_DATABASE ?? 'my_database',
  entities: [User, Invitation, Category, Event, Customer],
  // TypeORM tự tạo/sửa bảng cho khớp entity mỗi lần app khởi động.
  // Lưu ý: đổi tên cột sẽ bị hiểu là xóa cột cũ + thêm cột mới, dữ liệu cột đó mất.
  synchronize: true,
};
