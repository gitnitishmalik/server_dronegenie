import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  async sendVerificationEmail(to: string, otp: string, fullName: string) {
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject: 'DriveEasy Email Verification',
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🚗 DriveEasy</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Your Ride, Your Rules</p>
  </div>
  
  <!-- Content -->
  <div style="padding: 30px;">
    <h2 style="color: #1e293b; margin: 0 0 15px 0;">Welcome to DriveEasy, ${fullName}! 🎉</h2>
    <p style="color: #64748b; line-height: 1.6;">Thanks for joining our community. Please verify your email address to get started.</p>
    
    <!-- Verification Code -->
    <div style="background-color: #f8fafc; padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0; border: 2px solid #e2e8f0;">
      <h3 style="margin: 0 0 15px 0; color: #374151;">🔐 Your Verification Code</h3>
      <div style="font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 4px; background-color: white; padding: 15px; border-radius: 8px; border: 2px dashed #2563eb; font-family: monospace;">
        ${otp}
      </div>
      <p style="margin: 15px 0 0 0; color: #6b7280; font-size: 14px;">⏰ Expires in 10 minutes</p>
    </div>
    
    <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444;">
      <p style="margin: 0; color: #dc2626; font-size: 14px;">🛡️ If you didn't create a DriveEasy account, please ignore this email.</p>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
    <p style="margin: 0; color: #6b7280; font-size: 14px;">Best regards,<br><strong>The DriveEasy Team</strong></p>
    <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px;">© 2024 DriveEsy - Drive Your Way</p>
  </div>
</div>`
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Verification email sent successfully');
      return { success: true, message: 'Verification email sent successfully' };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(to: string, fullName: string) {
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject: '🎉 Welcome to DriveEasy - Let\'s Begin A New Journey',
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🎉 DriveEasy</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Your Adventurous Journey Begins Now!</p>
  </div>
  
  <!-- Content -->
  <div style="padding: 30px;">
    <h2 style="color: #1e293b; margin: 0 0 15px 0;">Welcome aboard, ${fullName}! ✨</h2>
    <p style="color: #64748b; line-height: 1.6;">Your email has been verified successfully! You're now part of the DriveEasy community where You Can Unlock Your Next Journey.</p>
    
    <!-- Getting Started -->
    <div style="background-color: #f0fdf4; padding: 25px; border-radius: 12px; margin: 25px 0; border: 2px solid #bbf7d0;">
      <h3 style="margin: 0 0 15px 0; color: #2563eb;">🚀 Getting Started</h3>
      <div style="color: #2563eb; line-height: 1.8;">
        <p style="margin: 8px 0;">📝 <strong>Complete your profile</strong> - Choose Your Dream Car And Drive Your Way</p>
        <p style="margin: 8px 0;">🔍 <strong>Find Dream Cars</strong> - Join groups for your subjects</p>
        <p style="margin: 8px 0;">👥 <strong>rom Daily Drives to Weekend Escapes.</p>
        <p style="margin: 8px 0;">🎥 <strong>Schedule Your Journey</strong> - Plan A Adventorous Trip</p>
      </div>
    </div>
    
    <!-- Features Highlight -->
    <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b;">
      <h4 style="margin: 0 0 10px 0; color: #92400e;">✨ What you can do:</h4>
      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
        Join Our Premium Plan • Take Your Car Without Delivery Charge • Advance Booking • Easy Return From Any Where • Claim Your Insurance
      </p>
    </div>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="/dashboard" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
        🏠 Go to Dashboard
      </a>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
    <p style="margin: 0; color: #6b7280; font-size: 14px;">Happy Journey!<br><strong>The DriveEasy Team</strong></p>
    <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px;">© 2024 DriveEasy - Collaborative Learning Platform</p>
  </div>
</div>`
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent successfully');
      return { success: true, message: 'Welcome email sent successfully' };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendPasswordResetLink(to: string, link: string) {
    console.log('Reset link:', link);
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject: 'Drone Genie - Reset Your Password', // Fixed typo
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🚁 Drone Genie</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Securely Reset Your Password</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px;">
          <h2 style="color: #1e293b; margin: 0 0 15px 0;">Hi there! 👋</h2>
          <p style="color: #475569; line-height: 1.6;">We received a request to reset your password for your Drone Genie account. No worries — we've got you covered! Just click the button below to set a new password. This link will expire in <strong>15 minutes</strong>.</p>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
              <tr>
                <td align="center">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background-color: #16a34a; border-radius: 8px; border: 2px solid #16a34a;">
                        <a href="${link}" 
                           target="_blank"
                           style="display: inline-block; 
                                  padding: 14px 28px; 
                                  color: #ffffff !important; 
                                  text-decoration: none !important; 
                                  font-weight: bold; 
                                  font-size: 16px; 
                                  font-family: Arial, sans-serif;
                                  border-radius: 8px;">
                          🔐 Reset Your Password
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Fallback Link -->
            <p style="color: #64748b; line-height: 1.6; font-size: 14px; margin-top: 20px; font-family: Arial, sans-serif;">
          
              If the button doesn't work, copy and paste this link into your browser: <br>
              <a href="${link}" target="_blank" style="color: #16a34a; word-break: break-all; text-decoration: underline;">${link}</a>
            </p>

          <p style="color: #64748b; line-height: 1.6;">If you didn't request a password reset, you can safely ignore this email. Your account is still secure.</p>
          <p style="margin-top: 30px; color: #1e293b;">Stay safe,<br><strong>The Drone Genie Team</strong></p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Need help? Contact us anytime at <a href="mailto:support@dronegenie.com" style="color: #16a34a; text-decoration: none;">support@dronegenie.com</a></p>
          <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px;">© 2025 Drone Genie. All rights reserved.</p>
        </div>
      </div>
    `
    };

    try {
      await this.transporter.sendMail(mailOptions); // ✅ Actually send the email
      console.log('Password reset email sent successfully');
      return { success: true, message: 'Password reset email sent successfully' };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return { success: false, error: error.message };
    }

  }

  async sendInvoiceEmail(
    to: string,
    recipientName: string,
    invoiceNumber: string,
    orderNo: string,
    role: 'VENDOR' | 'CUSTOMER',
    pdfBuffer: Buffer,
    fileName: string,
  ) {
    const roleLabel = role === 'VENDOR' ? 'Vendor' : 'Customer';
    const intro =
      role === 'VENDOR'
        ? 'Your order has been completed and the payout has been released. Your tax invoice for this engagement is attached below.'
        : 'Thank you for using Drone Genie. Your order has been completed — your tax invoice for this engagement is attached below.';

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject: `Drone Genie Invoice ${invoiceNumber} - Order ${orderNo}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🚁 Drone Genie</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">${roleLabel} Invoice</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #1e293b; margin: 0 0 15px 0;">Hi ${recipientName || 'there'},</h2>
          <p style="color: #475569; line-height: 1.6;">${intro}</p>
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
            <p style="margin: 4px 0; color: #1e293b;"><strong>Invoice:</strong> ${invoiceNumber}</p>
            <p style="margin: 4px 0; color: #1e293b;"><strong>Order:</strong> ${orderNo}</p>
          </div>
          <p style="color: #64748b; line-height: 1.6; font-size: 14px;">The PDF is attached to this email. You can also download it any time from your dashboard.</p>
          <p style="margin-top: 30px; color: #1e293b;">Best regards,<br><strong>The Drone Genie Team</strong></p>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Questions about your invoice? <a href="mailto:support@dronegenie.com" style="color: #16a34a; text-decoration: none;">support@dronegenie.com</a></p>
          <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px;">© 2026 Drone Genie. All rights reserved.</p>
        </div>
      </div>
      `,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Invoice email sent: ${invoiceNumber} → ${to}`);
      return { success: true };
    } catch (error) {
      console.error(`Error sending invoice email ${invoiceNumber} → ${to}:`, error);
      return { success: false, error: error.message };
    }
  }
  async sendChatInquiry(args: {
    fromName: string;
    fromEmail: string;
    fromPhone?: string;
    subject: string;
    message: string;
    inquiryType?: string;
  }) {
    const inbox = process.env.CHAT_INQUIRY_INBOX || process.env.GMAIL_USER;
    if (!inbox) return { success: false, error: 'inbox not configured' };

    const safe = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const subject = `[Drone Genie chat] ${safe(args.subject).slice(0, 120)}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #149C6C, #0f7a54); color: #fff; padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">Drone Genie chat enquiry</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">${safe(args.inquiryType || 'general')}</p>
        </div>
        <div style="background: #fff; border: 1px solid #149C6C33; border-top: none; padding: 24px 28px; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; font-size: 14px; color: #1f2937; line-height: 1.5;">
            <tr><td style="font-weight: 600; padding: 4px 12px 4px 0;">From:</td><td>${safe(args.fromName)} &lt;${safe(args.fromEmail)}&gt;</td></tr>
            ${args.fromPhone ? `<tr><td style="font-weight: 600; padding: 4px 12px 4px 0;">Phone:</td><td>${safe(args.fromPhone)}</td></tr>` : ''}
            <tr><td style="font-weight: 600; padding: 4px 12px 4px 0; vertical-align: top;">Subject:</td><td>${safe(args.subject)}</td></tr>
          </table>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <div style="white-space: pre-wrap; font-size: 14px; color: #111827; line-height: 1.6;">${safe(args.message)}</div>
        </div>
      </div>`;

    try {
      await this.transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: inbox,
        replyTo: `${args.fromName} <${args.fromEmail}>`,
        subject,
        html,
      });
      return { success: true };
    } catch (error: any) {
      console.error('Chat inquiry email failed:', error);
      return { success: false, error: error?.message || 'send failed' };
    }
  }
}
