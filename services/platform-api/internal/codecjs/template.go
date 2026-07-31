package codecjs

// DefaultScript est le modèle JavaScript ChirpStack v4 pour un nouveau décodeur.
const DefaultScript = `/**
 * ChirpStack v4 — Codec JavaScript personnalisé
 * Fonctions requises : decodeUplink(input), encodeDownlink(input)
 */

function decodeUplink(input) {
  var bytes = input.bytes;
  if (!bytes || !bytes.length) {
    return { data: {} };
  }
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return {
    data: {
      rawHex: hex,
      fPort: input.fPort,
      byteCount: bytes.length,
    },
  };
}

function encodeDownlink(input) {
  var data = input.data || {};
  if (data.payloadHex) {
    var hex = String(data.payloadHex).replace(/\s/g, "");
    var out = [];
    for (var i = 0; i < hex.length; i += 2) {
      out.push(parseInt(hex.substr(i, 2), 16));
    }
    return { bytes: out, fPort: data.fPort || 1 };
  }
  return { bytes: [], fPort: data.fPort || 1 };
}
`
