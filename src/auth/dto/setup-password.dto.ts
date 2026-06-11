import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class SetupPasswordDto {
  @ApiProperty({ description: 'Short-lived setup token received from the login response' })
  @IsString()
  setupToken: string;

  @ApiProperty({ minLength: 8, description: 'New password — must contain a number or special character' })
  @IsString()
  @MinLength(8)
  @Matches(/[0-9!@#$%^&*(),.?":{}|<>]/, {
    message: 'password must contain at least one number or special character',
  })
  password: string;

  @ApiProperty({ description: 'Must match password' })
  @IsString()
  confirmPassword: string;
}
