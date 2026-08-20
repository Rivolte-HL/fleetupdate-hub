import { UserRole } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  twoFactorEnabled: boolean;
}

export interface LoginResponse {
  user: AuthenticatedUser;
  token: string;
  requiresTwoFactor?: boolean;
  tempToken?: string;
}
