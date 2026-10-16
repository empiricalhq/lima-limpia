export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
}

export interface SuccessResponse<T> {
  data: T;
}

export interface ErrorResponse {
  error: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Member {
  id: string;
  userId: string;
  role: string;
  organizationId: string;
}

export interface Session {
  cookie: string;
  user: User;
  member: Member | null;
}

export interface Truck {
  id: string;
  name: string;
  license_plate: string;
}

export interface Route {
  id: string;
  name: string;
}

export interface Issue {
  id: string;
  type: string;
  description?: string;
}

export interface UserConfig {
  email: string;
  password: string;
  name: string;
  role: 'owner' | 'driver' | 'citizen';
}

export type UserType = 'admin' | 'driver' | 'citizen';
