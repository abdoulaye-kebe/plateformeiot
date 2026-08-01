/** Décodage Shengda V1.6 natif (sans eval) — aligné sur shengda-v1.6.codec.js */

const TYPE_LENGTHS: Record<number, number> = {
  0x01: 4, 0x02: 4, 0x03: 4, 0x04: 4, 0x05: 1, 0x06: 3, 0x07: 3, 0x08: 3,
  0x09: 1, 0x0a: 2, 0x0b: 4, 0x0c: 4, 0x0d: 4, 0x0e: 4, 0x0f: 1, 0x10: 1,
  0x11: 1, 0x12: 1, 0x13: 4, 0x14: 1, 0x15: 1, 0x16: 4, 0x17: 1, 0x19: 1,
  0x1a: 2, 0x1b: 1, 0x1c: 6, 0x1d: 3, 0x1e: 8, 0x1f: 1, 0x20: 1, 0x21: 4,
  0x23: 1, 0x24: 1, 0x25: 4, 0x26: 4, 0x27: 4, 0x28: 4, 0x29: 4, 0x2a: 4,
  0x2b: 1, 0x2c: 2, 0x2d: 2, 0x2e: 1, 0x33: 2, 0x34: 8, 0x35: 16, 0x36: 2,
  0x37: 1, 0x38: 4,
};

const PULSE_LITERS: Record<number, number> = { 0x01: 1, 0x02: 10, 0x03: 100, 0x04: 1000 };

const TRIGGER_LABELS: Record<number, string> = {
  0x00: "magnetic", 0x01: "routine", 0x02: "magnetic_attack", 0x03: "valve_control",
  0x04: "platform_read", 0x05: "platform_version_read", 0x06: "platform_param_set",
  0x07: "monthly_frozen", 0x08: "yearly_frozen", 0x09: "network_join", 0x0a: "dredge_valve",
  0x0b: "network_param_change", 0x0c: "valve_type_freq_change", 0x0d: "upgrade_command",
  0x0e: "timing_interval", 0x0f: "non_magnetic_alarm", 0x10: "dense_sampling",
  0x11: "q3_valve", 0x12: "lorawan_start", 0x13: "abnormal_alarm", 0xff: "param_error",
};

function u32be(bytes: number[], offset: number, len: number): number {
  let n = 0;
  for (let i = 0; i < len; i++) n = (n << 8) | (bytes[offset + i] & 0xff);
  return n >>> 0;
}

function parseType(bytes: number[], offset: number): { typeId: number; size: number } {
  const t0 = bytes[offset];
  if (t0 & 0x40) {
    const t1 = bytes[offset + 1];
    return { typeId: ((t0 & 0x3f) << 8) | t1, size: 2 };
  }
  return { typeId: t0 & 0x3f, size: 1 };
}

function readTvItems(bytes: number[], start: number, end: number): Record<number, number[]> {
  const items: Record<number, number[]> = {};
  let i = start;
  while (i < end) {
    const t0 = bytes[i];
    const hasLength = !!(t0 & 0x80);
    const parsed = parseType(bytes, i);
    const typeId = parsed.typeId;
    i += parsed.size;

    let length: number;
    let value: number[];
    if (hasLength) {
      if (i >= end) break;
      length = bytes[i];
      i += 1;
      value = bytes.slice(i, i + length);
      i += length;
    } else {
      length = TYPE_LENGTHS[typeId];
      if (length === undefined) break;
      value = bytes.slice(i, i + length);
      i += length;
    }
    if (value.length !== length) break;
    items[typeId] = value;
  }
  return items;
}

function applyFields(items: Record<number, number[]>): Record<string, unknown> {
  const out: Record<string, unknown> = { vendor: "shengda", protocol: "V1.6" };

  if (items[0x19]) out.packetSequence = items[0x19][0];
  if (items[0x16]) out.meterNumber = u32be(items[0x16], 0, items[0x16].length);
  if (items[0x0b]) out.pulseCount = u32be(items[0x0b], 0, items[0x0b].length);
  if (items[0x14]) {
    out.pulseConstant = items[0x14][0];
    out.pulseConstantLabel = `${PULSE_LITERS[out.pulseConstant as number] || "?"} L/pulse`;
  }
  if (items[0x1a]?.length >= 2) {
    out.batteryRaw = u32be(items[0x1a], 0, items[0x1a].length);
    out.batteryV = Math.round(((out.batteryRaw as number) / 16.4) * 100) / 100;
  }
  if (items[0x33]?.length >= 2) {
    const sw1 = items[0x33][0];
    const sw2 = items[0x33][1];
    out.statusWord1 = sw1;
    out.statusWord2 = sw2;
    out.valveFault = !!(sw1 & 0x80);
    out.batteryLow = !!(sw1 & 0x40);
    out.magneticAttack = !!(sw1 & 0x20);
    out.valveOpen = !(sw1 & 0x04);
  }
  if (items[0x23]) {
    out.triggerSource = items[0x23][0];
    out.triggerLabel = TRIGGER_LABELS[out.triggerSource as number] || "other";
  }
  if (out.pulseCount !== undefined) {
    const lpp = PULSE_LITERS[(out.pulseConstant as number) || 0x01] || 1;
    out.indexLiters = (out.pulseCount as number) * lpp;
    out.indexM3 = Math.round(((out.indexLiters as number) / 1000) * 1000) / 1000;
  }
  return out;
}

function decodeBytes(bytes: number[]): Record<string, unknown> {
  if (!bytes.length) return { vendor: "shengda", empty: true };

  let frameHeader: number | null = null;
  let checksumOk: boolean | null = null;
  let start = 0;
  let end = bytes.length;

  if (bytes[0] === 0x24 || bytes[0] === 0x25 || bytes[0] === 0x26) {
    frameHeader = bytes[0];
    start = 1;
    end = bytes.length - 1;
    if (end > 0) {
      const cs = bytes[bytes.length - 1];
      let sum = 0;
      for (let i = 0; i < bytes.length - 1; i++) sum += bytes[i];
      checksumOk = (sum & 0xff) === cs;
    }
  }

  const data = applyFields(readTvItems(bytes, start, end));
  data.frameHeader = frameHeader;
  data.checksumOk = checksumOk;
  return data;
}

/** Décode un payload ChirpStack (hex ou base64). */
export function decodeShengdaPayload(payload: string): Record<string, unknown> {
  const hex = normalizePayloadToHex(payload);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return decodeBytes(bytes);
}

function normalizePayloadToHex(input: string): string {
  const s = input.replace(/\s/g, "");
  if (!s) throw new Error("Payload vide");
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) return s.toLowerCase();
  try {
    const bin = atob(s);
    let hex = "";
    for (let i = 0; i < bin.length; i++) {
      hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    throw new Error("Payload invalide (hex ou base64 attendu)");
  }
}
