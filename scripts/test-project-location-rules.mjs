import assert from "node:assert/strict";
import {
  ALL_PROJECT_LOCATIONS,
  DEFAULT_PROJECT_LOCATIONS,
  NO_PROJECT_LOCATION,
  NO_PROJECT_LOCATION_LABEL,
  getProjectLocationLabel,
  matchesProjectLocation,
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
assert.equal(matchesProjectLocation("Los Cabos", ALL_PROJECT_LOCATIONS), true);
assert.equal(matchesProjectLocation("Los Cabos", "Los Cabos"), true);
assert.equal(matchesProjectLocation("Ciudad de México", "Los Cabos"), false);
assert.equal(matchesProjectLocation(undefined, NO_PROJECT_LOCATION), true);
assert.equal(matchesProjectLocation("Los Cabos", NO_PROJECT_LOCATION), false);

console.log("Project location catalog rules: OK");
