import { Controller, Patch, Param, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateEmailDto } from './update-email.dto';

@Controller({ path: 'email', version: '1' }) // Add version: '1'
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch(':id')
  async updateEmail(@Param('id') id: string, @Body() updateEmailDto: UpdateEmailDto) {
    try {
      const updatedUser = await this.userService.updateEmail(id, updateEmailDto.email);
      return {
        message: 'Email updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error.message.includes('unique constraint')) {
        throw new BadRequestException('Email already exists');
      }
      throw new BadRequestException('Failed to update email');
    }
  }
}