/** Helpers QuickJS-like pour tester decodeUplink dans le navigateur (admin). */

function mkBytes(arr: number[]) {
  const o: Record<string, unknown> & { length: number; slice: (s: number, e?: number) => unknown } = {
    length: arr.length,
    slice(start: number, end?: number) {
      return mkBytes(arr.slice(start, end ?? arr.length));
    },
  };
  for (let i = 0; i < arr.length; i++) o[i] = arr[i];
  return o;
}

/** ChirpStack envoie le payload en base64 ; l'archive peut contenir l'un ou l'autre format. */
export function normalizePayloadToHex(input: string): string {
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
    throw new Error("Payload invalide (attendu hex ou base64 ChirpStack)");
  }
}

export function testDecodeUplink(script: string, hexPayload: string, fPort: number): Record<string, unknown> {
  const hex = normalizePayloadToHex(hexPayload);
  if (!hex || hex.length % 2 !== 0) {
    throw new Error("Payload hex invalide");
  }
  if (!/function\s+decodeUplink|decodeUplink\s*=/.test(script) && /decodeShengdaFrame/.test(script)) {
    throw new Error(
      "decodeUplink(input) manquant — enregistrez le décodeur : un wrapper ChirpStack sera ajouté automatiquement, ou cliquez « Importer modèle Shengda »."
    );
  }
  if (!/function\s+decodeUplink|decodeUplink\s*=/.test(script)) {
    throw new Error("decodeUplink(input) requis — voir modèle ChirpStack v4 (QuickJS).");
  }
  const arr: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    arr.push(parseInt(hex.slice(i, i + 2), 16));
  }

  const preamble = `
function __mkBytes(arr) {
  var o = { length: arr.length, slice: function(s,e){ e = e === undefined ? arr.length : e; return __mkBytes(arr.slice(s,e)); } };
  for (var i = 0; i < arr.length; i++) o[i] = arr[i];
  return o;
}
var __testBytes = __mkBytes([${arr.join(",")}]);
`;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const runner = new Function(
    `${preamble}\n${script}\nreturn decodeUplink({ bytes: __testBytes, fPort: ${fPort || 1} });`
  );
  const result = runner();
  if (!result || typeof result !== "object") {
    throw new Error("decodeUplink doit retourner un objet");
  }
  return result as Record<string, unknown>;
}

export function unwrapDecodedData(result: Record<string, unknown>): Record<string, unknown> {
  const inner = result.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return result;
}

/** Résumé court pour la colonne Data (compteurs Shengda et autres). */
export function formatDecodedPreview(result: Record<string, unknown>): string {
  const data = unwrapDecodedData(result);
  const parts: string[] = [];
  if (data.indexM3 != null) parts.push(`${data.indexM3} m³`);
  if (data.valveOpen != null) parts.push(data.valveOpen ? "vanne ouverte" : "vanne fermée");
  if (data.batteryV != null) parts.push(`${data.batteryV} V`);
  if (data.pulseCount != null && data.indexM3 == null) parts.push(`pulses ${data.pulseCount}`);
  if (parts.length) return parts.join(" · ");
  if (data.vendor) return String(data.vendor);
  const compact = JSON.stringify(data);
  return compact.length > 72 ? `${compact.slice(0, 69)}…` : compact;
}
