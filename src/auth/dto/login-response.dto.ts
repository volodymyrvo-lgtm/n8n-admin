import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class LoginResponseDto {
  accessToken!: string;
  user!: UserResponseDto;
}
