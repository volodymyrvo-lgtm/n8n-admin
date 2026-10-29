import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { JwtPayloadResponseDto } from './dto/jwt-payload-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { JwtPayload } from './types/jwt-payload.type.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  /** Демонструє JwtAuthGuard: повертає payload токена, якщо він валідний. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: JwtPayloadResponseDto })
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
