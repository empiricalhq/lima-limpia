// biome-ignore-all lint/style/noExcessiveClassesPerFile: ApiError is owned by and scoped to ApiClient.
import { API_URL, RETRY_CONFIG } from "@/constants";
import { storage } from "@/lib/storage";
import type {
  CreateReportInput,
  LocationCoords,
  LoginInput,
  Report,
  SignUpInput,
  Truck,
  TruckStatus,
  User,
} from "@/types";

export class ApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

class ApiClient {
  private readonly baseUrl = API_URL;

  private async attemptRequest<T>(
    endpoint: string,
    options: RequestInit,
    headers: Record<string, string>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });

    if (response.status === 401) {
      await storage.clearAuth();
      throw new ApiError(
        "Sesión expirada. Por favor, inicia sesión nuevamente.",
        "AUTH_EXPIRED",
        401,
      );
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        message: "Ocurrió un error en el servidor.",
      }));
      throw new ApiError(
        errorBody.message || "Error en la solicitud.",
        errorBody.code,
        response.status,
      );
    }

    if (response.status === 204) {
      return null as T;
    }

    const data = await response.json();
    return data.data === undefined ? data : data.data;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_ATTEMPTS; attempt += 1) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each retry must wait for the previous attempt to fail.
        return await this.attemptRequest<T>(endpoint, options, headers);
      } catch (error: unknown) {
        lastError = error as Error;

        if (
          error instanceof ApiError &&
          error.status &&
          error.status >= 400 &&
          error.status < 500
        ) {
          throw error;
        }

        if (attempt < RETRY_CONFIG.MAX_ATTEMPTS - 1) {
          const delay = Math.min(
            RETRY_CONFIG.BASE_DELAY * 2 ** attempt,
            RETRY_CONFIG.MAX_DELAY,
          );
          console.info(
            `Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.MAX_ATTEMPTS})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error("All retry attempts failed:", lastError);
    if (lastError instanceof ApiError) {
      throw lastError;
    }

    throw new ApiError(
      "No se pudo conectar con el servidor. Verifica tu conexión.",
      "NETWORK_ERROR",
    );
  }

  async login(input: LoginInput): Promise<User> {
    const response = await this.request<{ user: User }>(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    await storage.setUser(response.user);
    return response.user;
  }

  async signUp(input: SignUpInput): Promise<User> {
    const response = await this.request<{ user: User }>(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    await storage.setUser(response.user);
    return response.user;
  }

  async logout(): Promise<void> {
    try {
      await this.request("/api/auth/sign-out", { method: "POST" });
    } catch (error: unknown) {
      console.warn("Logout request failed, clearing local data anyway", error);
    } finally {
      await storage.clearAuth();
    }
  }

  getStoredUser(): Promise<User | null> {
    return storage.getUser();
  }

  async validateSession(): Promise<User | null> {
    try {
      const response = await this.request<{ user: User }>(
        "/api/auth/get-session",
      );
      return response.user;
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === "AUTH_EXPIRED") {
        return null;
      }
      throw error;
    }
  }

  updateProfileLocation(coords: LocationCoords): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/api/citizen/profile/location", {
      method: "PUT",
      body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude }),
    });
  }

  async getTrucks(): Promise<Truck[]> {
    const trucks = await this.request<
      {
        id: string;
        name: string;
        license_plate: string;
        lat: number | null;
        lng: number | null;
        location_updated_at: string | null;
      }[]
    >("/api/citizen/trucks");

    return trucks
      .filter((t) => t.lat && t.lng)
      .map((t) => ({
        id: t.id,
        name: t.name,
        licensePlate: t.license_plate,
        lat: t.lat as number,
        lng: t.lng as number,
        lastUpdate: t.location_updated_at as string,
      }));
  }

  getTruckStatus(): Promise<TruckStatus> {
    return this.request<TruckStatus>("/api/citizen/truck/status");
  }

  async createReport(input: CreateReportInput): Promise<Report> {
    const response = await this.request<{
      id: string;
      type: string;
      description: string;
      status: string;
      lat: number;
      lng: number;
      photo_url?: string;
      created_at: string;
    }>("/api/citizen/issues", {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        description: input.description,
        lat: input.latitude,
        lng: input.longitude,
        photo_url: input.photoUrl,
      }),
    });

    const status = this.mapStatus(response.status);
    if (!status) {
      throw new ApiError("Estado de reporte inválido", "INVALID_STATUS");
    }

    return {
      id: response.id,
      type: response.type as Report["type"],
      description: response.description,
      status,
      latitude: response.lat,
      longitude: response.lng,
      photoUrl: response.photo_url,
      createdAt: response.created_at,
    };
  }

  private mapStatus(status: string): Report["status"] | null {
    const mapped = {
      in_progress: "in_progress",
      resolved: "resolved",
      open: "open",
    } as const;

    return mapped[status as keyof typeof mapped] || null;
  }
}

export const api = new ApiClient();
