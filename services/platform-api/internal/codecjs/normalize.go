package codecjs

import (
	_ "embed"
	"strings"
)

//go:embed shengda-v1.6.codec.js
var shengdaScript string

func ShengdaScript() string {
	return shengdaScript
}

// EnsureChirpStackCodec vérifie que le script expose decodeUplink (ChirpStack v4).
// Si seul decodeShengdaFrame est présent, ajoute un wrapper compatible.
func EnsureChirpStackCodec(script string) (string, error) {
	script = strings.TrimSpace(script)
	if script == "" {
		return DefaultScript, nil
	}
	if strings.Contains(script, "function decodeUplink") || strings.Contains(script, "decodeUplink=") {
		return script, nil
	}
	if strings.Contains(script, "decodeShengdaFrame") {
		return script + "\n" + shengdaFrameWrapper, nil
	}
	return "", ErrMissingDecodeUplink
}

var ErrMissingDecodeUplink = errCodec("decodeUplink(input) requis — ChirpStack v4 attend decodeUplink et encodeDownlink")

type errCodec string

func (e errCodec) Error() string { return string(e) }

const shengdaFrameWrapper = `
// Wrapper auto — API ChirpStack v4
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
  var decoded = decodeShengdaFrame(hex);
  if (decoded && typeof decoded === "object" && decoded.data !== undefined) {
    return decoded;
  }
  return { data: decoded };
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
