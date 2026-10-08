import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { CreateUserDto } from './user.dto';
import { Auth } from '../auth/auth.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  createUser(@Body() user: CreateUserDto): Promise<User> {
    return this.userService.create(user);
  }

  @Auth('admin')
  @Get()
  getAllUsers(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Auth('admin')
  @Get(':id')
  getUserById(@Param('id') id: number): Promise<User> {
    return this.userService.findOne(id);
  }
}
