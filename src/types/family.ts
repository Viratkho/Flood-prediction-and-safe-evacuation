/**
 * FloodGuard 2.1 — Dynamic Population & Family Safety Types
 */

export interface FamilyMemberLocation {
  connectionId: number;
  personId: string;
  name: string;
  relationship: string;
  contactNumber?: string;
  medicalConditions?: string;
  hasDisability: boolean;
  disabilityType?: string;
  lat: number | null;
  lng: number | null;
  gpsAccuracyM?: number;
  locationName?: string;
  lastUpdated?: string;
  isStale: boolean;
  isInHighRiskFlood: boolean;
  sosActive: boolean;
  floodDepthM?: number;
  shareLocation: boolean;
}

export interface FamilyRequest {
  id: number;
  requesterId: string;
  invitedId: string;
  relationship: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  requesterName?: string;
  invitedName?: string;
}

export interface FamilySosAlert {
  id: number;
  userId: string;
  senderName: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  locationName?: string;
  alertMessage: string;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED';
}

export interface PopulationAnalysisResult {
  center: { lat: number; lng: number };
  radiusM: number;
  areaSqKm: number;
  densityPerSqKm: number;
  totalIndividuals: number;
  breakdown: {
    withDeclaredDisabilities: number;
    withoutDeclaredDisabilities: number;
    unknownDisabilityStatus: number;
    activeSosCount: number;
    highRiskFloodCount: number;
    staleLocationCount: number;
  };
  rescuePriority: {
    level: 'P0' | 'P1' | 'P2' | 'P3';
    label: string;
    description: string;
    color: string;
  };
  individuals: Array<{
    personId: string;
    name: string;
    age?: number;
    gender?: string;
    lat: number;
    lng: number;
    distanceM: number;
    hasDisability: boolean;
    disabilityType?: string;
    sosActive: boolean;
    floodDepthM: number;
    isInHighRiskFlood: boolean;
    isStale: boolean;
    contactNumber?: string;
    addressLandmark?: string;
  }>;
}
