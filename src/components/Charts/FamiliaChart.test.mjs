import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chart } from "react-charts";
import FamiliaChart from "./FamiliaChart";

vi.mock("react-charts", () => ({ Chart: vi.fn(() => null) }));

function renderChart(data, total) {
    const markup = renderToStaticMarkup(React.createElement(FamiliaChart, {
        chartId: "control-chart-1",
        title: "Gasto Mano de Obra",
        color: "#256A34",
        data,
        total,
    }));

    return { markup, options: Chart.mock.lastCall?.[0].options };
}

beforeEach(() => vi.clearAllMocks());

describe("FamiliaChart cumulative spending", () => {
    it("ends at the displayed total without adding cumulative balances again", () => {
        const { markup, options } = renderChart([
            { date: "05 Jul", monto: 100_000 },
            { date: "05 Jul", monto: 250_000 },
            { date: "12 Jul", monto: 900_000 },
            { date: "04 Oct", monto: 1_700_000 },
        ], 1_700_000);

        expect(markup).toContain("$1.7M");
        expect(options.data[0].data.map(point => point.secondary))
            .toEqual([250_000, 900_000, 1_700_000]);
    });

    it("keeps the closing daily balance after a refund on the same day", () => {
        const { options } = renderChart([
            { date: "05 Jul", monto: 1_000 },
            { date: "05 Jul", monto: 1_500 },
            { date: "05 Jul", monto: 1_200 },
        ], 1_200);

        expect(options.data[0].data.map(point => point.secondary)).toEqual([1_200]);
    });

    it("preserves decreases, zero balances and negative balances", () => {
        const { options } = renderChart([
            { date: "05 Jul", monto: 1_000 },
            { date: "06 Jul", monto: 750 },
            { date: "07 Jul", monto: 0 },
            { date: "08 Jul", monto: -100 },
        ], -100);

        expect(options.data[0].data.map(point => point.secondary))
            .toEqual([1_000, 750, 0, -100]);
    });

    it("orders dates chronologically without changing the cumulative amounts", () => {
        const { options } = renderChart([
            { date: "03 Jul", monto: 1_700 },
            { date: "01 Jul", monto: 500 },
            { date: "02 Jul", monto: 1_000 },
        ], 1_700);

        expect(options.data[0].data.map(point => [point.primary.getDate(), point.secondary]))
            .toEqual([[1, 500], [2, 1_000], [3, 1_700]]);
    });

    it("distinguishes fractional millions on the axis and shows exact tooltip amounts", () => {
        const { options } = renderChart([{ date: "04 Oct", monto: 1_700_000 }], 1_700_000);
        const { scale, tooltip } = options.secondaryAxes[0].formatters;

        expect(scale(1_200_000)).toBe("$1.2M");
        expect(scale(1_400_000)).toBe("$1.4M");
        expect(scale(500_000)).toBe("$500K");
        expect(scale(0)).toBe("$0");
        expect(tooltip(1_700_000)).toBe("$1,700,000");
    });

    it("shows the empty state without drawing a chart", () => {
        const { markup, options } = renderChart([], 0);

        expect(markup).toContain("Sin datos para mostrar");
        expect(options).toBeUndefined();
    });
});
