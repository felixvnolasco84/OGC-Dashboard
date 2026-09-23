export type ProjectLocationOption = {
  key: string;
  name: string;
  order: number;
};

export type ProjectLocationKey = string;

export const DEFAULT_PROJECT_LOCATIONS: readonly ProjectLocationOption[] = [
  { key: "Los Cabos", name: "Los Cabos", order: 0 },
  { key: "Ciudad de México", name: "Ciudad de México", order: 1 },
] as const;

export const NO_PROJECT_LOCATION = "__sin_ubicacion__" as const;
export const NO_PROJECT_LOCATION_LABEL = "Sin ubicación";

export const normalizeProjectLocationName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");

export const validateProjectLocationName = (
  name: string,
  locations: readonly ProjectLocationOption[],
  currentKey?: string,
) => {
  const trimmedName = name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeProjectLocationName(trimmedName);

  if (!trimmedName) {
    throw new Error("El nombre de la ubicación es obligatorio");
  }
  if (trimmedName.length > 80) {
    throw new Error("El nombre de la ubicación no puede exceder 80 caracteres");
  }
  if (
    normalizedName === normalizeProjectLocationName(NO_PROJECT_LOCATION_LABEL) ||
    trimmedName === NO_PROJECT_LOCATION
  ) {
    throw new Error(`“${NO_PROJECT_LOCATION_LABEL}” es un nombre reservado`);
  }
  if (
    locations.some(
      (location) =>
        location.key !== currentKey &&
        normalizeProjectLocationName(location.name) === normalizedName,
    )
  ) {
    throw new Error("Ya existe una ubicación con ese nombre");
  }

  return trimmedName;
};

export const getProjectLocationLabel = (
  locationKey?: string,
  locations: readonly ProjectLocationOption[] = DEFAULT_PROJECT_LOCATIONS,
) => {
  if (!locationKey) return NO_PROJECT_LOCATION_LABEL;
  return locations.find((location) => location.key === locationKey)?.name || locationKey;
};
