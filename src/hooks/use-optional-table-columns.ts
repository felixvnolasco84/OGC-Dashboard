import { useCallback, useEffect, useMemo, useState } from "react";

const LAPTOP_QUERY = "(max-width: 1535px)";

export function useIsLaptopWidth() {
    const [matches, setMatches] = useState(() =>
        typeof window !== "undefined" ? window.matchMedia(LAPTOP_QUERY).matches : false,
    );

    useEffect(() => {
        const media = window.matchMedia(LAPTOP_QUERY);
        const onChange = () => setMatches(media.matches);
        onChange();
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    return matches;
}

export function useOptionalTableColumns<T extends string>(
    columns: readonly { id: T; label: string }[],
) {
    const isLaptop = useIsLaptopWidth();
    const [overrides, setOverrides] = useState<Partial<Record<T, boolean>>>({});

    const isVisible = useCallback(
        (id: T) => {
            const override = overrides[id];
            if (override !== undefined) return override;
            return !isLaptop;
        },
        [isLaptop, overrides],
    );

    const toggle = useCallback((id: T) => {
        setOverrides((current) => {
            const currentlyVisible = current[id] !== undefined ? Boolean(current[id]) : !isLaptop;
            return { ...current, [id]: !currentlyVisible };
        });
    }, [isLaptop]);

    const visibleCount = useMemo(
        () => columns.filter((column) => isVisible(column.id)).length,
        [columns, isVisible],
    );

    return { isVisible, toggle, visibleCount, isLaptop };
}
