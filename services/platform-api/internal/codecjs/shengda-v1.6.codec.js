/**
 * ChirpStack v4 — Codec JavaScript Shengda Application Layer V1.6
 * Compteurs d'eau : télérelevé + contrôle vanne (downlink port 2)
 *
 * decodeUplink / encodeDownlink — QuickJS (ES2020) + Buffer
 */

var TYPE_LENGTHS = {
  0x01: 4, 0x02: 4, 0x03: 4, 0x04: 4, 0x05: 1, 0x06: 3, 0x07: 3, 0x08: 3,
  0x09: 1, 0x0a: 2, 0x0b: 4, 0x0c: 4, 0x0d: 4, 0x0e: 4, 0x0f: 1, 0x10: 1,
  0x11: 1, 0x12: 1, 0x13: 4, 0x14: 1, 0x15: 1, 0x16: 4, 0x17: 1, 0x19: 1,
  0x1a: 2, 0x1b: 1, 0x1c: 6, 0x1d: 3, 0x1e: 8, 0x1f: 1, 0x20: 1, 0x21: 4,
  0x23: 1, 0x24: 1, 0x25: 4, 0x26: 4, 0x27: 4, 0x28: 4, 0x29: 4, 0x2a: 4,
  0x2b: 1, 0x2c: 2, 0x2d: 2, 0x2e: 1, 0x33: 2, 0x34: 8, 0x35: 16, 0x36: 2,
  0x37: 1, 0x38: 4,
};

var PULSE_LITERS = { 0x01: 1, 0x02: 10, 0x03: 100, 0x04: 1000 };

var METER_TYPES = {
  0x00: "water", 0x01: "gas", 0x02: "heat", 0x03: "electricity", 0x04: "gas_sensor",
};

var METERING_MODES = {
  0x00: "dual_reed", 0x01: "single_reed", 0x02: "dual_hall", 0x03: "direct_reading",
  0x04: "non_magnetic_inductive", 0x05: "non_magnetic_coil", 0x06: "triple_hall",
  0x07: "single_hall", 0x08: "edc_u_pulse", 0x09: "iuw_pulse", 0x0a: "edc_b1_pulse",
  0x0b: "edc_b2_pulse", 0x0c: "iuw_nfc_pulse", 0x0d: "adc_acquisition",
  0x0e: "near_camera", 0x0f: "remote_camera",
};

var VALVE_TYPES = {
  0x00: "two_wire", 0x01: "five_wire", 0x02: "no_valve", 0x03: "angle_valve", 0x04: "four_wire",
};

var LORAWAN_CLASSES = {
  0x00: "class_a", 0x01: "class_b", 0x02: "class_c", 0x03: "dual_mode",
};

var METER_STATUS = {
  0: "normal", 1: "empty_pipe", 2: "flow_overload", 4: "storage_fault",
  5: "transducer_fault", 6: "wrong_direction",
};

var TRIGGER_LABELS = {
  0x00: "magnetic", 0x01: "routine", 0x02: "magnetic_attack", 0x03: "valve_control",
  0x04: "platform_read", 0x05: "platform_version_read", 0x06: "platform_param_set",
  0x07: "monthly_frozen", 0x08: "yearly_frozen", 0x09: "network_join", 0x0a: "dredge_valve",
  0x0b: "network_param_change", 0x0c: "valve_type_freq_change", 0x0d: "upgrade_command",
  0x0e: "timing_interval", 0x0f: "non_magnetic_alarm", 0x10: "dense_sampling",
  0x11: "q3_valve", 0x12: "lorawan_start", 0x13: "abnormal_alarm", 0xff: "param_error",
};

function u32be(bytes, offset, len) {
  var n = 0;
  for (var i = 0; i < len; i++) n = (n << 8) | (bytes[offset + i] & 0xff);
  return n >>> 0;
}

function parseType(bytes, offset) {
  var t0 = bytes[offset];
  if (t0 & 0x40) {
    var t1 = bytes[offset + 1];
    return { typeId: ((t0 & 0x3f) << 8) | t1, size: 2 };
  }
  return { typeId: t0 & 0x3f, size: 1 };
}

function readTvItems(bytes, start, end) {
  var items = {};
  var i = start;
  while (i < end) {
    var t0 = bytes[i];
    var hasLength = !!(t0 & 0x80);
    var parsed = parseType(bytes, i);
    var typeId = parsed.typeId;
    i += parsed.size;

    var length;
    var value;
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

function checksum(body) {
  var sum = 0;
  for (var i = 0; i < body.length; i++) sum += body[i];
  return sum & 0xff;
}

function buildDownlink(parts) {
  var body = parts.slice();
  return body.concat([checksum(body)]);
}

function applyFields(items) {
  var out = { vendor: "shengda", protocol: "V1.6" };

  if (items[0x19]) out.packetSequence = items[0x19][0];
  if (items[0x16]) out.meterNumber = u32be(items[0x16], 0, items[0x16].length);
  if (items[0x1b]) {
    out.meterType = items[0x1b][0];
    out.meterTypeLabel = METER_TYPES[out.meterType] || "unknown";
  }
  if (items[0x12]) {
    out.meteringMode = items[0x12][0];
    out.meteringModeLabel = METERING_MODES[out.meteringMode] || "unknown";
  }
  if (items[0x09]) {
    out.lorawanClass = items[0x09][0];
    out.lorawanClassLabel = LORAWAN_CLASSES[out.lorawanClass] || "unknown";
  }
  if (items[0x17]) {
    out.valveType = items[0x17][0];
    out.valveTypeLabel = VALVE_TYPES[out.valveType] || "unknown";
  }
  if (items[0x0b]) out.pulseCount = u32be(items[0x0b], 0, items[0x0b].length);
  if (items[0x14]) {
    out.pulseConstant = items[0x14][0];
    out.pulseConstantLabel = (PULSE_LITERS[out.pulseConstant] || "?") + " L/pulse";
  }
  if (items[0x1a] && items[0x1a].length >= 2) {
    out.batteryRaw = u32be(items[0x1a], 0, items[0x1a].length);
    out.batteryV = Math.round((out.batteryRaw / 16.4) * 100) / 100;
  }
  if (items[0x33] && items[0x33].length >= 2) {
    var sw1 = items[0x33][0];
    var sw2 = items[0x33][1];
    out.statusWord1 = sw1;
    out.statusWord2 = sw2;
    out.valveFault = !!(sw1 & 0x80);
    out.batteryLow = !!(sw1 & 0x40);
    out.magneticAttack = !!(sw1 & 0x20);
    out.batteryRemoved = !!(sw1 & 0x10);
    out.valveOpen = !(sw1 & 0x04);
    out.meteringFault = !!(sw1 & 0x02);
    out.remoteFlag = !!(sw1 & 0x01);
    out.waterInletAlarm = !!(sw2 & 0x80);
    out.waterReturnAlarm = !!(sw2 & 0x40);
    out.flowAlarm = !!(sw2 & 0x20);
    out.meterStatus = (sw2 >> 2) & 0x07;
    out.meterStatusLabel = METER_STATUS[out.meterStatus] || "unknown";
    out.historicalMagneticAttack = !!(sw2 & 0x02);
  }
  if (items[0x23]) {
    out.triggerSource = items[0x23][0];
    out.triggerLabel = TRIGGER_LABELS[out.triggerSource] || "other";
  }
  if (out.pulseCount !== undefined) {
    var lpp = PULSE_LITERS[out.pulseConstant || 0x01] || 1;
    out.indexLiters = out.pulseCount * lpp;
    out.indexM3 = Math.round((out.indexLiters / 1000) * 1000) / 1000;
  }
  return out;
}

function decodeBytes(bytes) {
  if (!bytes || bytes.length === 0) return { vendor: "shengda", empty: true };

  var frameHeader = null;
  var checksumOk = null;
  var start = 0;
  var end = bytes.length;

  if (bytes[0] === 0x24 || bytes[0] === 0x25 || bytes[0] === 0x26) {
    frameHeader = bytes[0];
    start = 1;
    end = bytes.length - 1;
    if (end > 0) {
      var cs = bytes[bytes.length - 1];
      var sum = 0;
      for (var i = 0; i < bytes.length - 1; i++) sum += bytes[i];
      checksumOk = (sum & 0xff) === cs;
    }
  }

  var items = readTvItems(bytes, start, end);
  var data = applyFields(items);
  data.frameHeader = frameHeader;
  data.checksumOk = checksumOk;
  return data;
}

// --- ChirpStack codec API ---

function decodeUplink(input) {
  var bytes = input.bytes;
  if (!bytes || !bytes.length) {
    return { data: { vendor: "shengda", empty: true } };
  }
  return { data: decodeBytes(bytes) };
}

function encodeDownlink(input) {
  var data = input.data || {};
  var action = (data.action || data.valve || "").toLowerCase();

  var VALVE = { open: 0x00, close: 0x01, dredge: 0x02, dredge_on: 0x03, dredge_off: 0x04 };
  var bytes;

  if (action === "read") {
    bytes = buildDownlink([0x26, 0x20, 0x01]);
  } else if (VALVE[action] !== undefined) {
    bytes = buildDownlink([0x26, 0x1f, VALVE[action]]);
  } else if (data.payloadHex) {
    var hex = String(data.payloadHex).replace(/\s/g, "");
    bytes = [];
    for (var i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
  } else {
    throw new Error("encodeDownlink: action open|close|dredge|read ou payloadHex requis");
  }

  var out = { bytes: bytes, fPort: data.fPort || 2 };
  return out;
}
