import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../generated/prisma/client.js';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @IsEmail({}, { message: 'username must be a valid email address' })
  @MaxLength(32)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt мовчки обрізає все, що довше 72 байтів
  password!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
