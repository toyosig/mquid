import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ description: 'Min 8 chars, must include number or symbol' })
  @IsString()
  @MinLength(8)
  @Matches(/[0-9!@#$%^&*(),.?":{}|<>]/, { message: 'password must contain a number or symbol' })
  password: string;

  @ApiProperty()
  @IsString()
  confirmPassword: string;
}
