export function parseFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((f): f is string => typeof f === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((f): f is string => typeof f === "string");
    } catch {
      return [];
    }
  }
  return [];
}

export function hasFeature(features: string[] | undefined, feature: string): boolean {
  if (!features) return false;
  return features.includes(feature) || features.includes("*");
}
