type ArrivalKind = "auth" | "page";

let arrival: ArrivalKind | null = null;

/** Document loads keep native focus; explicit SPA/history arrivals announce the heading. */
export function markPublicAuthArrival(kind: ArrivalKind = "auth") {
  arrival = kind;
}

export function hasPublicAuthArrival() {
  return arrival !== null;
}

/** Page arrivals use their page transition, never a second form entry. */
export function getPublicAuthArrivalKind() {
  return arrival;
}
