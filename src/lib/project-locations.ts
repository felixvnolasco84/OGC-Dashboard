export const PROJECT_LOCATIONS = ["Los Cabos", "Ciudad de México"] as const;

export type ProjectLocation = (typeof PROJECT_LOCATIONS)[number];

export const NO_PROJECT_LOCATION = "__sin_ubicacion__" as const;
export const NO_PROJECT_LOCATION_LABEL = "Sin ubicación";

export const getProjectLocationLabel = (location?: ProjectLocation) =>
  location || NO_PROJECT_LOCATION_LABEL;
