
import { ForbiddenException, Injectable, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { jwtConstants } from './constants';
import { OtpVerificationDto, SignInDto, SignUpDto, UpdateUserDto, ForgotPasswordDto, ResetPasswordDto, AdminUpdateUserDto, ResetForgotPasswordDto, CustomerSignupDto, VendorSignupAllDto, ResendOtpDto, ChangePhoneDto } from './dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CompanyType, Prisma, User, UserRole } from '@prisma/client';
import { JwtPayload, Tokens } from './types';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'src/mail/mail.service';
import { sendSMS } from '../common/utils/send-sms.util'

// Fixed bcrypt hash used to equalize timing on the no-user branch of signin.
// Value is a bcrypt of a random string, cost 10 — matches the cost of real
// user password hashes so the compare takes the same wall time either way.
// This is not a secret (bcrypt hashes are safe to expose); its purpose is
// purely to make the attacker's clock unhelpful.
const DUMMY_BCRYPT_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.aA4mKkCnkmn7PL0eYQOyN4fL1S4u';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mailService: MailService,
  ) { }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }


  private mapUniqueErrorToMessage(e: Prisma.PrismaClientKnownRequestError): string {
    // meta.target can be an index name or an array of fields depending on provider
    const target = (e.meta?.target ?? '') as string | string[];

    const includes = (needle: string) =>
      Array.isArray(target) ? target.some(t => t.includes(needle)) : String(target).includes(needle);

    // Prioritize the most common collisions
    if (includes('email') && includes('User')) return 'This email is already registered.';
    if (includes('phone') && includes('User')) return 'An account with this mobile number already exists';
    if (includes('representative_email')) return 'Representative email is already in use.';
    if (includes('GST')) return 'GST number already exists. Please use a different one.';
    if (includes('PAN')) return 'PAN number already exists. Please use a different one.';
    if (includes('userId') || includes('Customer_userId')) return 'This user already has a customer profile.';

    // Fallback generic
    return 'One or more unique fields already exist. Please use different values.';
  }


  private mapVendorUniqueErrorToMessage(error: any): string {
    const t = (error?.meta?.target as string[]) || [];
    const idx = Array.isArray(t) ? t.join(',') : String(t || '');

    // User uniques
    if (idx.includes('email')) return 'This email is already in use.';
    if (idx.includes('phone')) return 'This phone number is already in use.';

    // Vendor uniques
    if (idx.includes('userId')) return 'This user already has a vendor profile.';
    if (idx.includes('representative_email')) return 'Representative email is already in use.';
    if (idx.includes('GST')) return 'GST number is already in use.';
    if (idx.includes('PAN')) return 'PAN number is already in use.';

    // Fallback by known constraint names (optional)
    const msgMap: Record<string, string> = {
      User_email_key: 'This email is already in use.',
      User_phone_key: 'This phone number is already in use.',
      Vendor_userId_key: 'This user already has a vendor profile.',
      Vendor_representative_email_key: 'Representative email is already in use.',
      Vendor_GST_key: 'GST number is already in use.',
      Vendor_PAN_key: 'PAN number is already in use.',
    };
    for (const k of Object.keys(msgMap)) {
      if (String(error?.message || '').includes(k)) return msgMap[k];
    }
    return 'Duplicate value violates a unique constraint.';
  }



  private isValidPAN(pan: string) {
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
  }

  private isValidGST(gst: string) {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst);
  }

  // You already have these in your original code
  // private async hashData(password: string) { /* ... */ }
  // private async getTokens(userId: string, email: string, roles: any[]) { /* ... */ }
  // private async updateRtHash(userId: string, rt: string, waitForOtp: boolean) { /* ... */ }
  // private async sendSMS(phone: string, otp: string) { /* ... your sendSMS(...) */ }


  private normalizeSignupPayload(dto: any) {
    // Accept nested: { user: {...}, customer: {...} }
    // or flat: { name,email,phone,password, comp_type,address,..., PAN,GST,... }
    const user = dto?.user ?? {
      name: dto?.name,
      email: dto?.email,
      phone: dto?.phone,
      password: dto?.password,
      role: dto?.role ?? 'CUSTOMER',
    };

    const customer = dto?.customer ?? {
      comp_name: dto?.comp_name,
      comp_type: dto?.comp_type,
      address: dto?.address,
      website: dto?.website,
      representative: dto?.representative,
      representative_email: dto?.representative_email,
      representative_phone: dto?.representative_phone,
      GST: dto?.GST,
      PAN: dto?.PAN,
      isTermsAccepted: dto?.isTermsAccepted,
    };

    return { user, customer };
  }


  private normalizeVendorSignupPayload(dto: VendorSignupAllDto) {
    const u = {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
    };

    const v = {
      comp_name: dto.comp_name,
      comp_type: dto.comp_type,
      address: dto.address,
      website: dto.website,
      representative: dto.representative,
      representative_email: dto.representative_email,
      representative_phone: dto.representative_phone,
      GST: dto.GST,
      PAN: dto.PAN,
      isTermsAccepted: dto.isTermsAccepted,
      isActive: dto.isActive ?? false,
    };

    const s = {
      serviceIds: dto.serviceIds,
    };

    return { u, v, s };
  }


  // -------------------------
  // Signup Customer (single method, inline logic)
  // -------------------------
  async signupCustomer(dto: CustomerSignupDto) {
    const { user: u, customer: c } = this.normalizeSignupPayload(dto);
    // basic validations omitted for brevity...
    const otp = this.generateOTP();
    const expiriesIn = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await this.hashData(u.password);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1) lookup by email only
        const existing = await tx.user.findUnique({
          where: { email: u.email },
          select: { id: true, waitForOtp: true },
        });

        let userId: string;
        if (!existing) {
          const created = await tx.user.create({
            data: {
              name: u.name,
              email: u.email,
              phone: u.phone,
              roles: ['CUSTOMER'],
              password: passwordHash,
              isActive: false,
              otp,
              expiriesIn,
              waitForOtp: true,
              rtHash: '',
            }
          });
          userId = created.id;
        } else {
          if (!existing.waitForOtp) {
            throw new ConflictException('Email already registered. Please login or recover your account.');
          }
          const updated = await tx.user.update({
            where: { id: existing.id },
            data: {
              name: u.name,
              phone: u.phone,
              password: passwordHash,
              otp,
              expiriesIn,
              isActive: false,
              waitForOtp: true,
            }
          });
          userId = updated.id;
        }


        const existingVendor = await tx.vendor.findUnique({ where: { userId } });
        if (existingVendor) {
          throw new ConflictException('This user already has a vendor profile.');
        }

        const existingCustomer = await tx.customer.findUnique({ where: { userId } });
        if (existingCustomer) {
          throw new ConflictException('This user already has a customer profile.');
        }

        // create customer (phone uniqueness enforced by DB)
        const newCustomer = await tx.customer.create({
          data: {
            userId,
            comp_name: c.comp_name,
            comp_type: c.comp_type,
            address: c.address,
            website: c.website,
            representative: c.representative,
            representative_email: c.representative_email,
            representative_phone: c.representative_phone,
            GST: c.GST,
            PAN: c.PAN,
            isTermsAccepted: c.isTermsAccepted,
          },
          include: { user: { select: { id: true, email: true, phone: true } } }
        });

        return { userId, newCustomer };
      });

      await sendSMS(u.phone, otp);
      const tokens = await this.getTokens(result.userId, u.email, ['CUSTOMER']);
      await this.updateRtHash(result.userId, tokens.refresh_token, true);

      return {
        message: 'Signup initiated. OTP sent to your phone.',
        customer: result.newCustomer,
        tokens,
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // map to clear message — see helper below
        throw new ConflictException(this.mapUniqueErrorToMessage(error));
      }
      // preserve friendly exceptions
      if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
      console.error(error);
      throw new BadRequestException('Unable to complete signup.');
    }
  }



  // -------------------------
  // Signup Vendor (single method, inline logic)
  // -------------------------
  async signupVendor(dto: VendorSignupAllDto) {
    const { u, v, s } = this.normalizeVendorSignupPayload(dto);

    // Basic checks
    if (!u?.email || !u?.phone || !u?.password || !u?.name) {
      throw new BadRequestException('Missing required user fields: name, email, phone, password.');
    }
    if (!v) throw new BadRequestException('Missing vendor object.');
    if (!s?.serviceIds?.length) throw new BadRequestException('At least one service ID is required.');
    if (!v.PAN) throw new BadRequestException('PAN is required.');
    if (!v.GST) throw new BadRequestException('GST is required.');
    if (v.isTermsAccepted !== true) {
      throw new BadRequestException('You must accept the terms to continue.');
    }
    if (!this.isValidPAN(v.PAN)) throw new BadRequestException('Invalid PAN number format.');
    if (!this.isValidGST(v.GST)) throw new BadRequestException('Invalid GST number format.');

    const otp = this.generateOTP();
    const expiriesIn = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await this.hashData(u.password);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Lookup by email only (simplified logic)
        const existing = await tx.user.findUnique({
          where: { email: u.email },
          select: { id: true, waitForOtp: true },
        });

        let userId: string;

        if (!existing) {
          // No user with that email -> create
          const created = await tx.user.create({
            data: {
              name: u.name,
              email: u.email,
              phone: u.phone,
              roles: ['VENDOR'],
              profile: null,
              password: passwordHash,
              isActive: v.isActive ?? false,
              otp,
              expiriesIn,
              waitForOtp: true,
              rtHash: '',
            },
          });
          userId = created.id;
        } else {
          // Found by email
          if (!existing.waitForOtp) {
            // verified -> block signup
            throw new ConflictException('Email already registered. Please login or recover your account.');
          }
          // pending -> update that user with incoming details
          const updated = await tx.user.update({
            where: { id: existing.id },
            data: {
              name: u.name,
              phone: u.phone,
              email: u.email,
              roles: { set: ['VENDOR'] },
              password: passwordHash,
              otp,
              expiriesIn,
              isActive: v.isActive ?? false,
              waitForOtp: true,
            },
          });
          userId = updated.id;
        }

        // Guards: prevent duplicate profiles for this user
        const existingVendor = await tx.vendor.findUnique({ where: { userId } });
        if (existingVendor) {
          throw new ConflictException('This user already has a vendor profile.');
        }

        const existingCustomer = await tx.customer.findUnique({ where: { userId } });
        if (existingCustomer) {
          throw new ConflictException('This user already has a customer profile.');
        }

        // Create vendor record
        const newVendor = await tx.vendor.create({
          data: {
            userId,
            comp_name: v.comp_name,
            comp_type: v.comp_type as CompanyType,
            address: v.address,
            website: v.website,
            representative: v.representative,
            representative_email: v.representative_email,
            representative_phone: v.representative_phone,
            GST: v.GST,
            PAN: v.PAN,
            isTermsAccepted: v.isTermsAccepted,
          },
          include: {
            user: { select: { id: true, email: true, phone: true } },
          },
        });

        // Attach vendor services (dedupe)
        const uniqueServiceIds = Array.from(new Set(s.serviceIds));
        const existingVendorServices = await tx.vendorService.findMany({
          where: { vendorId: newVendor.id, serviceId: { in: uniqueServiceIds } },
        });
        const already = new Set(existingVendorServices.map(vs => vs.serviceId));
        const createData = uniqueServiceIds
          .filter(id => !already.has(id))
          .map(serviceId => ({ vendorId: newVendor.id, serviceId }));

        if (createData.length > 0) {
          await tx.vendorService.createMany({ data: createData });
        }

        return { userId, newVendor, createdServiceCount: createData.length };
      });

      // After transaction: send OTP and issue tokens
      await sendSMS(u.phone, otp);

      const tokens = await this.getTokens(result.userId, u.email, ['VENDOR']);
      await this.updateRtHash(result.userId, tokens.refresh_token, true);

      return {
        message: 'Signup initiated. OTP sent to your phone.',
        vendor: result.newVendor,
        createdServiceCount: result.createdServiceCount,
        tokens,
      };
    } catch (error: any) {
      // Map unique constraint errors to friendly messages (phone, email, representative_email, GST, PAN etc.)
      if (error?.code === 'P2002') {
        throw new ConflictException(this.mapUniqueErrorToMessage(error));
      }
      if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) {
        throw error;
      }
      console.error(error);
      throw new BadRequestException(error?.message ?? 'Unable to complete signup.');
    }
  }




  async signup(dto: SignUpDto): Promise<Tokens> {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { phone: dto.phone }
        ]
      },
    });

    const generateOTP = (): string => {
      return Math.floor(100000 + Math.random() * 900000).toString();
    };

    const otp = generateOTP();

    const expiriesIn = new Date(Date.now() + 10 * 60 * 1000)

    const password = await this.hashData(dto.password);

    let user: any;
    if (existingUser) {
      if (!existingUser.waitForOtp) {
        throw new BadRequestException("Email or Phone no. Already Verified");
      }

      user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: dto.name,
          password,
          otp,
          expiriesIn,
        }
      });

    } else {
      user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          roles: [dto.role],
          // isActive: false,
          password: password,
          otp,
          expiriesIn,
          waitForOtp: true,
          rtHash: '',
        },
      });
    }

    await sendSMS(dto.phone, otp)

    const tokens = await this.getTokens(user.id, user.email, 
      user.roles,
    );
    await this.updateRtHash(user.id, tokens.refresh_token, true);

    return tokens;
  }

  async signin(dto: SignInDto): Promise<Tokens> {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    // All auth failures return ONE generic message at the same status code.
    // Distinguishing "user not found" from "wrong password" from "wrong role"
    // lets an unauthenticated attacker enumerate registered emails on the
    // platform. We also run a dummy bcrypt compare on the no-user branch so
    // the response time is indistinguishable — otherwise the timing itself
    // leaks existence. Do NOT log the email or the reason at info level.
    const INVALID = 'Invalid email or password';

    if (!user) {
      // Constant-ish time: bcrypt.compare against a fixed hash with the
      // attacker-supplied password so the compute cost matches the real path.
      await bcrypt.compare(dto.password || '', DUMMY_BCRYPT_HASH);
      throw new UnauthorizedException(INVALID);
    }

    if (!user.isActive) {
      throw new UnauthorizedException(INVALID);
    }

<<<<<<< Updated upstream
    if (dto.role && dto.role !== user.roles) {
=======
    if (dto.role && !user.roles.includes(dto.role)) {
>>>>>>> Stashed changes
      throw new UnauthorizedException(INVALID);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID);
    }

    const tokens = await this.getTokens(user.id, user.email, user.roles);
    await this.updateRtHash(user.id, tokens.refresh_token, user.waitForOtp);

    return tokens;
  }

  async logout(userId: string): Promise<boolean> {
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        rtHash: null,
      },
    });
    return true;
  }

  async refreshTokens(userId: string, rt: string): Promise<Tokens> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user || !user.rtHash) throw new ForbiddenException('Access Denied');

    const rtMatches = await bcrypt.compare(rt, user.rtHash);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.getTokens(user.id, user.email, user.roles);
    await this.updateRtHash(user.id, tokens.refresh_token, user.waitForOtp);

    return tokens;
  }

  async verifyOtp(dto: OtpVerificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Single generic error for every failure path so an unauthenticated
    // attacker can't walk email lists to enumerate (a) registered users,
    // (b) users currently in the OTP window, or (c) already-verified users.
    const INVALID = 'Invalid email or OTP';

    if (!user) {
      throw new UnauthorizedException(INVALID);
    }

    if (!user.waitForOtp) {
      throw new UnauthorizedException(INVALID);
    }

    // Attempt counter — after MAX_OTP_ATTEMPTS wrong tries, the OTP is
    // burned and the user must request a fresh one via /auth/resend-otp.
    // This prevents 6-digit brute force on a single OTP.
    const MAX_OTP_ATTEMPTS = 5;
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      // Invalidate the current OTP so even the legit user has to reissue.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { otp: '', otpAttempts: 0 },
      });
      throw new UnauthorizedException(INVALID);
    }

    // Expiry check — expiriesIn is set to now+10min when the OTP is issued
    // (see signup / change-phone / resend-otp paths). Expired OTPs are
    // treated as invalid, same response body as every other failure.
    if (!user.expiriesIn || user.expiriesIn.getTime() < Date.now()) {
      throw new UnauthorizedException(INVALID);
    }

    if (dto.otp !== user.otp) {
      // Increment the attempt counter but still return the generic error.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException(INVALID);
    }

    // Success — clear OTP, reset counter, activate.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otp: "",
        expiriesIn: new Date(Date.now()),
        otpAttempts: 0,
        isActive: true,
        waitForOtp: false,
      },
    });

    const tokens = await this.getTokens(user.id, user.email, user.roles);
    await this.updateRtHash(user.id, tokens.refresh_token, user.waitForOtp);

    return tokens;
  }

  async sendResetLink(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new NotFoundException('User not found');

    const token = await this.jwtService.signAsync(
      { email: user.email },
      {
        secret: process.env.FORGOT_SECRET,
        expiresIn: '15m',
      }
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    // TODO: Email password reset button is not working fix this
    // await this.mailService.sendPasswordResetLink(user.email, resetLink)
    const mailPayload = {
      mail_to: user.email,
      mail_subject: "Sending Forgot Password Link",
      mail_body: `Hi ${user.name ?? "User"},\n\nWe received a request to reset your account password.\n\nPlease click the link below to set a new password:\n${resetLink}\n\nThis link will expire in 15 minutes for your security.\n\nIf you did not request a password reset, please ignore this email or contact our support team immediately.\n\nBest regards,\nYour Company Team`
    };

    // Send email
    try {
      const response = await fetch("https://kgninfotech.orgnixo.com/api/send_email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mailPayload),
      });

      // If the mail API returns non-2xx, treat as failure
      if (!response.ok) {
        const text = await response.text().catch(() => null);
        console.error("Mail API error:", response.status, text);
        throw new InternalServerErrorException("Failed to send OTP email");
      }
    } catch (mailError) {
      console.error("Failed to call mail API:", mailError);
      throw new InternalServerErrorException("Failed to send OTP email");
    }

    return { message: 'Reset link sent to email' };
  }

  async resetForgotPassword(dto: ResetForgotPasswordDto, token: string) {
    const { newPassword } = dto;

    let payload: any;

    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.FORGOT_SECRET, // Should be FORGOT_SECRET
      });

    } catch (err) {
      throw new ForbiddenException('Invalid or expired token');
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { email: payload.email },
      data: { password: hashed },
    });

    return { message: 'Password reset successful' };
  }

  // Reset Password (Step 2)
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new ForbiddenException('User not found');
    if (!user.waitForOtp) throw new ForbiddenException('OTP not required');
    if (dto.otp !== '123456') throw new ForbiddenException('Invalid OTP');

    const hashedPassword = await this.hashData(dto.newPassword);

    await this.prisma.user.update({
      where: { email: dto.email },
      data: {
        password: hashedPassword,
        waitForOtp: false,
        isActive: true,
      },
    });

    return { message: 'Password has been reset successfully' };
  }


  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        name: true,
        email: true,
        phone: true,
        profile: true
      }
    });

    if (!user) {
      throw new NotFoundException('User Not Found');
    }

    return user;
  }


  async updateUser(
    userId: string,
    file: Express.Multer.File,
    authUserId: string,
    dto: UpdateUserDto
  ): Promise<Tokens> {
    if (userId !== authUserId) {
      throw new ForbiddenException('You can only update your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new ForbiddenException('User not found');

    const updateData: any = {};

    // ✅ Handle profile image upload
    if (file) {
      const imageUrl = file.filename // upload and get S3 URL
      updateData.profile = imageUrl; // Make sure this field exists in your model
    }

    // ✅ Handle email change
    if (dto.email && dto.email !== user.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailExists) throw new ForbiddenException('Email already exists');
      updateData.email = dto.email;
      updateData.waitForOtp = true;
      updateData.isActive = false;
    }

    // ✅ Handle password change
    if (dto.newPassword && dto.currentPassword) {
      const passwordMatches = await bcrypt.compare(dto.currentPassword, user.password);
      if (!passwordMatches) {
        throw new ForbiddenException('Current password is incorrect');
      }
      updateData.password = await this.hashData(dto.newPassword);
    } else if (dto.newPassword && !dto.currentPassword) {
      throw new ForbiddenException('Current password is required to change password');
    }

    if (Object.keys(updateData).length === 0) {
      throw new ForbiddenException('No valid updates provided');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    const tokens = await this.getTokens(
      updatedUser.id,
      updatedUser.email,
      updatedUser.roles
    );

    await this.updateRtHash(
      updatedUser.id,
      tokens.refresh_token,
      updatedUser.waitForOtp
    );

    return tokens;
  }


  async updateUserByAdmin(userId: string, dto: AdminUpdateUserDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};

    if (dto.email && dto.email !== user.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new ForbiddenException('Email already exists');
      updateData.email = dto.email;
      updateData.waitForOtp = true;
    }

    if (dto.name) updateData.name = dto.name;
    if (dto.phone) updateData.phone = dto.phone;

    // ✅ only set if explicitly provided (true/false)
    if (typeof dto.isActive === 'boolean') {
      updateData.isActive = dto.isActive;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }



  async updateRtHash(
    userId: string,
    rt: string,
    waitForOtp: boolean,
  ): Promise<void> {
    const hash = await this.hashData(rt);
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        rtHash: hash,
        waitForOtp,
      },
    });
  }

  async hashData(data: string): Promise<string> {
    return bcrypt.hash(data, 10);
  }

  async getTokens(
    userId: string,
    identification: string,
    role: UserRole[],
  ): Promise<Tokens> {
    const jwtPayload: JwtPayload = {
      sub: userId,
      identification: identification,
      role: role,
    };
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.config.get<string>('AT_SECRET'),
        expiresIn: '7d',
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: this.config.get<string>('RT_SECRET'),
        expiresIn: '30d',
      }),
    ]);

    return {
      access_token: at,
      refresh_token: rt,
      userId: userId,
      role: role.join(','),
      email: identification,
    };
  }

  async resendOtp(dto: ResendOtpDto) {
    const { email, phone } = dto;

    if (!email && !phone) {
      throw new BadRequestException('Provide phone to resend OTP.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    if (!user) {
      return { message: 'If this account exists, a new OTP has been sent.' };
    }

    if (!user.waitForOtp) {
      throw new BadRequestException('This account is already verified; OTP is not required.');
    }

    const otp = this.generateOTP();
    const expiriesIn = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otp,
        expiriesIn,
        otpAttempts: 0,
      },
    });

    try {
      await sendSMS(user.phone, otp);
    } catch (e) {
      console.error('Failed to send SMS for resend-otp:', e);
    }

    return { message: 'OTP resent successfully.' };
  }

  async changePhone(dto: ChangePhoneDto) {
    const { email, phone: rawPhone } = dto;

    const phone = String(rawPhone ?? '').trim();
    if (!phone) {
      throw new BadRequestException('Phone is required');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');


    if (user.phone === phone) {
      const otp = this.generateOTP();
      const expiriesIn = new Date(Date.now() + 10 * 60 * 1000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          otp,
          expiriesIn,
          waitForOtp: true,
          // isActive: false, // lock until verified
        },
      });

      await sendSMS(phone, otp);
      return { message: 'OTP resent to your current phone number' };
    }

    // Ensure new phone is not used by another user (match EXACT string)
    const exists = await this.prisma.user.findFirst({
      where: { phone, NOT: { id: user.id } },
    });
    if (exists) {
      throw new ConflictException('Phone already in use');
    }

    // Generate OTP & require verification
    const otp = this.generateOTP();
    const expiriesIn = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phone,
        otp,
        expiriesIn,
        waitForOtp: true,
        // isActive: false,  
      },
    });

    await sendSMS(phone, otp);

    return {
      message: 'Phone updated. OTP sent to the new number.',
    };
  }


}

