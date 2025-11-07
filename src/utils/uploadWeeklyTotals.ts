// Utility to format and upload weekly projected totals
// This data corresponds to the weekly totals from your Excel file

export const weeklyTotalsData = [
  { date: "29/9/2025", amount: "$ 1.060.475,01" },
  { date: "6/10/2025", amount: "$ 863.383,38" },
  { date: "13/10/2025", amount: "$ 198.842,63" },
  { date: "20/10/2025", amount: "$ 524.753,43" },
  { date: "27/10/2025", amount: "$ 609.490,24" },
  { date: "3/11/2025", amount: "$ 692.109,51" },
  { date: "10/11/2025", amount: "$ 221.674,64" },
  { date: "17/11/2025", amount: "$ 256.440,59" },
  { date: "24/11/2025", amount: "$ 867.097,65" },
  { date: "1/12/2025", amount: "$ 248.689,27" },
  { date: "8/12/2025", amount: "$ 265.354,39" },
  { date: "15/12/2025", amount: "$ 3.967.995,15" },
  { date: "22/12/2025", amount: "$ 267.073,18" },
  { date: "29/12/2025", amount: "$ 254.399,90" },
  { date: "5/1/2026", amount: "$ 254.399,90" },
  { date: "12/1/2026", amount: "$ 1.726.474,62" },
  { date: "19/1/2026", amount: "$ 248.514,73" },
  { date: "26/1/2026", amount: "$ 248.514,73" },
  { date: "2/2/2026", amount: "$ 382.077,67" },
  { date: "9/2/2026", amount: "$ 1.254.507,46" },
  { date: "16/2/2026", amount: "$ 242.363,62" },
  { date: "23/2/2026", amount: "$ 467.162,64" },
  { date: "2/3/2026", amount: "$ 1.300.319,52" },
  { date: "9/3/2026", amount: "$ 301.988,27" },
  { date: "16/3/2026", amount: "$ 301.988,27" },
  { date: "23/3/2026", amount: "$ 1.930.784,88" },
  { date: "30/3/2026", amount: "$ 258.823,32" },
  { date: "6/4/2026", amount: "$ 1.996.947,81" },
  { date: "13/4/2026", amount: "$ 295.126,89" },
  { date: "20/4/2026", amount: "$ 299.037,82" },
  { date: "27/4/2026", amount: "$ 299.037,82" },
  { date: "4/5/2026", amount: "$ 299.037,82" },
  { date: "11/5/2026", amount: "$ 881.987,17" },
  { date: "18/5/2026", amount: "$ 405.550,68" },
  { date: "25/5/2026", amount: "$ 366.127,03" },
  { date: "1/6/2026", amount: "$ 445.899,89" },
  { date: "8/6/2026", amount: "$ 445.899,89" },
  { date: "15/6/2026", amount: "$ 547.056,47" },
  { date: "22/6/2026", amount: "$ 473.710,55" },
  { date: "29/6/2026", amount: "$ 393.937,69" },
  { date: "6/7/2026", amount: "$ 712.148,34" },
  { date: "13/7/2026", amount: "$ 402.907,04" },
  { date: "20/7/2026", amount: "$ 369.360,02" },
  { date: "27/7/2026", amount: "$ 392.531,49" },
  { date: "3/8/2026", amount: "$ 443.856,70" },
  { date: "10/8/2026", amount: "$ 342.881,74" },
  { date: "17/8/2026", amount: "$ 302.644,26" },
  { date: "24/8/2026", amount: "$ 255.676,18" },
  { date: "31/8/2026", amount: "$ 111.051,81" },
  { date: "7/9/2026", amount: "$ 111.051,81" },
  { date: "14/9/2026", amount: "$ 97.584,41" },
  { date: "21/9/2026", amount: "$ 449.759,93" },
  { date: "28/9/2026", amount: "$ 98.736,44" },
  { date: "5/10/2026", amount: "$ 98.736,44" },
  { date: "12/10/2026", amount: "$ 98.736,44" },
  { date: "19/10/2026", amount: "$ 68.952,08" },
  { date: "26/10/2026", amount: "$ 616.633,21" },
];

// Calculate total for verification
export function calculateTotal(): number {
  return weeklyTotalsData.reduce((sum, item) => {
    // Parse European format: $ 1.234.567,89 -> 1234567.89
    const cleaned = item.amount.replace(/\$/g, '').trim();
    if (cleaned === '-') return sum;
    const withoutDots = cleaned.replace(/\./g, '');
    const withDecimalDot = withoutDots.replace(/,/g, '.');
    return sum + parseFloat(withDecimalDot);
  }, 0);
}

// Get non-zero entries only
export function getNonZeroEntries() {
  return weeklyTotalsData.filter(item => item.amount !== "$ -");
}

// Example usage:
// import { useMutation } from "convex/react";
// import { api } from "../../convex/_generated/api";
// import { weeklyTotalsData } from "@/utils/uploadWeeklyTotals";
// 
// const uploadTotals = useMutation(api.weekly_projected_totals.uploadWeeklyTotals);
// 
// await uploadTotals({
//   proyecto: selectedProject._id,
//   weeklyData: weeklyTotalsData
// });
