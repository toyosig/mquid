import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  resetToken: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/[0-9!@#$%^&*(),.?":{}|<>]/, { message: 'password must contain at least one number or special character' })
  password: string;

  @ApiProperty()
  @IsString()
  confirmPassword: string;
}
