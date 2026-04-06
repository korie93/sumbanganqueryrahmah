export type AiTravelDecision = {
  decision: string | null;
  travelMode: string | null;
  estimatedMinutes: number | null;
};

export function deriveAiTravelDecision(distanceKm: number | null | undefined): AiTravelDecision {
  if (distanceKm === undefined || distanceKm === null) {
    return {
      decision: null,
      travelMode: null,
      estimatedMinutes: null,
    };
  }

  if (distanceKm < 5) {
    return {
      decision: "WALK-IN",
      travelMode: "WALK",
      estimatedMinutes: Math.max(1, Math.round((distanceKm / 5) * 60)),
    };
  }

  if (distanceKm < 20) {
    return {
      decision: "DRIVE",
      travelMode: "DRIVE",
      estimatedMinutes: Math.max(1, Math.round((distanceKm / 40) * 60)),
    };
  }

  return {
    decision: "CALL",
    travelMode: "CALL",
    estimatedMinutes: null,
  };
}
