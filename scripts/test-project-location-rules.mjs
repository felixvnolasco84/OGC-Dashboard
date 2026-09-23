import assert from "node:assert/strict";
import {
  DEFAULT_PROJECT_LOCATIONS,
  NO_PROJECT_LOCATION_LABEL,
  getProjectLocationLabel,
  normalizeProjectLocationName,
  validateProjectLocationName,
} from "../src/lib/project-locations.ts";

assert.equal(normalizeProjectLocationName("  CIUDAD   de México "), "ciudad de mexico");
assert.equal(getProjectLocationLabel(), NO_PROJECT_LOCATION_LABEL);
assert.equal(getProjectLocationLabel("Los Cabos"), "Los Cabos");
assert.equal(
  getProjectLocationLabel("Los Cabos", [
    { key: "Los Cabos", name: "Baja California Sur", order: 0 },
  ]),
  "Baja California Sur",
);
assert.equal(
  validateProjectLocationName("  Guadalajara  ", DEFAULT_PROJECT_LOCATIONS),
  "Guadalajara",
);
assert.equal(
  validateProjectLocationName("Los Cabos", DEFAULT_PROJECT_LOCATIONS, "Los Cabos"),
  "Los Cabos",
);
assert.throws(
  () => validateProjectLocationName("ciudad de mexico", DEFAULT_PROJECT_LOCATIONS),
  /Ya existe/,
);
assert.throws(
  () => validateProjectLocationName("Sin ubicación", DEFAULT_PROJECT_LOCATIONS),
  /reservado/,
);

console.log("Project location catalog rules: OK");
