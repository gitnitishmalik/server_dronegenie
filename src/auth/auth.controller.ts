import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Param,
  UseInterceptors,
  UploadedFile,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  GetCurrentUser,
  GetCurrentUserId,
  Public,
  Roles,
} from 'src/common/decorators';
import { JwtPayload } from './types/jwtPayload.type';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  OtpVerificationDto,
  RefreshTokenDto,
  SignInDto,
  SignUpDto,
  UpdateUserDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AdminUpdateUserDto,
  ResetForgotPasswordDto,
  CustomerSignupDto,
  VendorSignupAllDto,
  ResendOtpDto,
  ChangePhoneDto,
} from './dto';
import { Tokens } from './types';
import { User, UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerConfig } from 'src/config/multer.config';

@ApiTags('Authentication')
@ApiBearerAuth()
@Throttle({ 'auth-strict': { limit: 10, ttl: 15 * 60_000 } })
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  signup(@Body() dto: SignUpDto): Promise<Tokens> {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('signup/customer')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, description: 'Customer registered successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  signupCustomer(@Body() dto: CustomerSignupDto) {
    return this.authService.signupCustomer(dto);
  }

  @Public()
  @Post('signup/vendor')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, description: 'Customer registered successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  signupVendor(@Body() dto: VendorSignupAllDto) {
    return this.authService.signupVendor(dto);
  }

  @Public()
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'User logged in successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  signin(@Body() dto: SignInDto): Promise<Tokens> {
    return this.authService.signin(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  logout(@GetCurrentUserId() userId: string): Promise<boolean> {
    return this.authService.logout(userId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  refreshTokens(
    @GetCurrentUserId() userId: string,
    @Body() dto: RefreshTokenDto,
  ): Promise<Tokens> {
    return this.authService.refreshTokens(userId, dto.refreshToken);
  }

  @Public()
  @Post('verify-otp')
  @Throttle({ 'otp-strict': { limit: 20, ttl: 60 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 401, description: 'Invalid email or OTP' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  verifyOtp(@Body() dto: OtpVerificationDto) {
    return this.authService.verifyOtp(dto);
  }

  @Patch('update/:id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('profile', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateUser(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @GetCurrentUserId() authUserId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<Tokens> {
    return this.authService.updateUser(id, file, authUserId, dto);
  }

  @Patch('admin/update/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'User updated by admin successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateUserByAdmin(
    @Param('id') userId: string,
    @Body() dto: AdminUpdateUserDto, // separate DTO for admin if needed
  ): Promise<User> {
    return this.authService.updateUserByAdmin(userId, dto);
  }

  // Previously @Public() — was an unauthenticated PII lookup returning
  // {name, email, phone, profile} for any user given their ID. Now requires
  // a valid JWT and restricts to self-lookup unless the caller is an admin.
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'User Retrived Successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getUser(@Param('id') id: string, @GetCurrentUser() caller: JwtPayload) {
    const isAdmin = caller.role?.includes(UserRole.ADMIN);
    if (!isAdmin && id !== caller.sub) {
      throw new ForbiddenException('You can only look up your own user record');
    }
    return await this.authService.getUser(id);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.sendResetLink(dto);
  }

  @Public()
  @Post('forgot-password/:token')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async resetForgotPassword(
    @Param('token') token: string,
    @Body() dto: ResetForgotPasswordDto,
  ) {
    return this.authService.resetForgotPassword(dto, token);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'OTP resent (or a generic message returned).',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (e.g., user already verified).',
  })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Public()
  @Post('change-phone')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'Phone updated; OTP sent to new number',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Phone already in use' })
  async changePhone(@Body() dto: ChangePhoneDto) {
    return this.authService.changePhone(dto);
  }
}
