/** Helpers ChirpStack device profiles (v4 flat ou nested). */

export type ProfileRow = {
  id?: string;
  name?: string;
  description?: string;
  region?: string;
  macVersion?: string;
  payloadCodecRuntime?: string;
  deviceProfile?: {
    id?: string;
    name?: string;
    description?: string;
    region?: string;
    macVersion?: string;
    payloadCodecRuntime?: string;
  };
};

export function profileId(row: ProfileRow): string {
  return (row.deviceProfile?.id ?? row.id ?? "").toLowerCase();
}

export function profileName(row: ProfileRow): string {
  return row.deviceProfile?.name ?? row.name ?? profileId(row) ?? "—";
}

export function profileDescription(row: ProfileRow): string {
  return row.deviceProfile?.description ?? row.description ?? "";
}

export function profileLabel(row: ProfileRow): string {
  const name = profileName(row);
  const runtime = row.deviceProfile?.payloadCodecRuntime ?? row.payloadCodecRuntime;
  const region = row.deviceProfile?.region ?? row.region;
  const parts = [name];
  if (region) parts.push(region);
  if (runtime) parts.push(runtime);
  return parts.join(" · ");
}
