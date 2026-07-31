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

export function testDecodeUplink(script: string, hexPayload: string, fPort: number): Record<string, unknown> {
  const hex = hexPayload.replace(/\s/g, "");
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
