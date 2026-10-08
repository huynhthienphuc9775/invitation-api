import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';
import { Category } from './category.entity';
import { Auth } from '../auth/auth.decorator';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Auth('admin')
  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  createCategory(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoryService.create(dto);
  }

  @Auth('admin')
  @Get()
  getAllCategories(): Promise<Category[]> {
    return this.categoryService.findAll();
  }

  @Auth('admin')
  @Get(':id')
  getCategory(@Param('id') id: number): Promise<Category> {
    return this.categoryService.findOne(id);
  }

  @Auth('admin')
  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  updateCategory(
    @Param('id') id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoryService.update(id, dto);
  }

  @Auth('admin')
  @Delete(':id')
  deleteCategory(@Param('id') id: number): Promise<void> {
    return this.categoryService.remove(id);
  }
}
