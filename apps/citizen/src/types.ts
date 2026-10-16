export interface Truck {
  id: string;
  name: string;
  licensePlate: string;
  lat: number;
  lng: number;
  lastUpdate: string;
}

export type TruckStatus =
  | {
      status: "ON_THE_WAY";
      etaMinutes: number;
      truckId: string;
      truckName: string;
    }
  | { status: "NEARBY"; truckId: string; truckName: string }
  | { status: "NOT_SCHEDULED"; message: string }
  | { status: "LOCATION_NOT_SET"; message: string };

export interface QuizQuestion {
  id: string;
  item: string;
  imageUrl: string;
  options: WasteType[];
  correctAnswer: WasteType;
}

export interface QuizProgress {
  streak: number;
  totalAnswered: number;
  correctAnswers: number;
  lastPlayed: string | null; // Calendar date in YYYY-MM-DD format.
}

export interface Report {
  id: string;
  type: "missed_collection" | "illegal_dumping" | "other";
  description: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export type WasteType = "general" | "recycling" | "organic" | "hazardous";

export interface ApiError {
  message: string;
  code?: string;
}

export interface CreateReportInput {
  type: Report["type"];
  description: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface LocationCoords {
  latitude: number;
  longitude: number;
}
