import { cn } from "@/lib/utils";

export type TopVariancePartida = {
    id?: string;
    partida: string;
    presupuesto: number;
    pagado: number;
    varianza: number;
    avance: number | null;
};

type TopVariancePartidasTableProps = {
    rows?: TopVariancePartida[];
    isLoading?: boolean;
    currency?: string;
};

const toFiniteNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getSafeCurrency = (currency: string) => {
    if (!/^[A-Z]{3}$/.test(currency)) return "MXN";

    try {
        new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(0);
        return currency;
    } catch {
        return "MXN";
    }
};

const formatCurrency = (value: number, currency = "MXN", includeCurrency = true) => {
    const amount = toFiniteNumber(value);
    const safeCurrency = getSafeCurrency(currency);
    const formatted = new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: safeCurrency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.abs(amount));

    return includeCurrency ? `${formatted} ${safeCurrency}` : formatted;
};

const formatVariance = (value: number, currency = "MXN") => {
    const amount = toFiniteNumber(value);
    const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
    return `${sign}${formatCurrency(amount, currency, false)}`;
};

const formatAdvance = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return "N/D";
    return `${Math.round(value)}%`;
};

export default function TopVariancePartidasTable({
    rows = [],
    isLoading = false,
    currency = "MXN",
}: TopVariancePartidasTableProps) {
    return (
        <section className="w-full mt-8">
            <h2 className="text-lg font-normal tracking-normal text-foreground mb-5">
                TOP 5 PARTIDAS CON MAYOR VARIANZA
            </h2>

            <div className="overflow-x-auto border border-border bg-card">
                <table className="w-full min-w-[800px] table-fixed border-collapse text-foreground">
                    <colgroup>
                        <col className="w-[42%]" />
                        <col className="w-[18%]" />
                        <col className="w-[18%]" />
                        <col className="w-[15%]" />
                        <col className="w-[7%]" />
                    </colgroup>
                    <thead>
                        <tr className="border-b border-border text-sm font-normal text-muted-foreground">
                            <th className="px-6 py-4 text-left font-normal">Partida</th>
                            <th className="px-6 py-4 text-left font-normal">Presupuesto</th>
                            <th className="px-6 py-4 text-left font-normal">Pagado</th>
                            <th className="px-6 py-4 text-left font-normal">Varianza</th>
                            <th className="px-5 py-4 text-left font-normal">Avance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td className="px-6 py-10 text-left text-sm text-muted-foreground" colSpan={5}>
                                    Cargando partidas...
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td className="px-6 py-10 text-left text-sm text-muted-foreground" colSpan={5}>
                                    Sin partidas para mostrar
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, index) => (
                                <tr key={row.id ?? `${row.partida}-${index}`} className="border-b border-border last:border-b-0">
                                    <td className="px-6 py-6 text-base  font-normal leading-snug text-left">
                                        <span className="block max-w-full truncate" title={row.partida}>
                                            {row.partida}
                                        </span>
                                    </td>
                                    <td className="px-6 py-6 text-left text-base  font-normal tabular-nums whitespace-nowrap">
                                        {formatCurrency(row.presupuesto, currency)}
                                    </td>
                                    <td className="px-6 py-6 text-left text-base  font-normal tabular-nums whitespace-nowrap">
                                        {formatCurrency(row.pagado, currency)}
                                    </td>
                                    <td
                                        className={cn(
                                            "px-6 py-6 text-left text-base  font-normal tabular-nums whitespace-nowrap",
                                            row.varianza < 0 && "text-[#8F2F2F]",
                                            row.varianza > 0 && "text-[#2E6E3B]"
                                        )}
                                    >
                                        {formatVariance(row.varianza, currency)}
                                    </td>
                                    <td className="px-5 py-6 text-left text-base  font-normal tabular-nums whitespace-nowrap">
                                        {formatAdvance(row.avance)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
