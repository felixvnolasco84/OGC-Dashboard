// Utility to format and upload weekly projected totals
// This data corresponds to the weekly totals from your Excel file

export const weeklyTotalsData = [
  { date: "6/1/2025", amount: "$ 54.517,68" },
  { date: "13/1/2025", amount: "$ 338.711,42" },
  { date: "20/1/2025", amount: "$ 1.030.623,46" },
  { date: "27/1/2025", amount: "$ 463.453,47" },
  { date: "3/2/2025", amount: "$ 1.280.597,65" },
  { date: "10/2/2025", amount: "$ 1.894.338,68" },
  { date: "17/2/2025", amount: "$ 682.808,88" },
  { date: "24/2/2025", amount: "$ 631.446,57" },
  { date: "3/3/2025", amount: "$ 1.169.233,21" },
  { date: "10/3/2025", amount: "$ 858.815,77" },
  { date: "17/3/2025", amount: "$ 858.815,77" },
  { date: "24/3/2025", amount: "$ 858.815,77" },
  { date: "31/3/2025", amount: "$ 858.815,77" },
  { date: "7/4/2025", amount: "$ 1.678.006,07" },
  { date: "14/4/2025", amount: "$ 760.214,07" },
  { date: "21/4/2025", amount: "$ 760.214,07" },
  { date: "28/4/2025", amount: "$ 1.424.567,85" },
  { date: "5/5/2025", amount: "$ 813.635,73" },
  { date: "12/5/2025", amount: "$ 813.635,73" },
  { date: "19/5/2025", amount: "$ 813.635,73" },
  { date: "26/5/2025", amount: "$ 813.635,73" },
  { date: "2/6/2025", amount: "$ 759.035,95" },
  { date: "9/6/2025", amount: "$ 759.035,95" },
  { date: "16/6/2025", amount: "$ 759.035,95" },
  { date: "23/6/2025", amount: "$ 1.297.921,33" },
  { date: "30/6/2025", amount: "$ 688.167,33" },
  { date: "7/7/2025", amount: "$ 5.662.564,61" },
  { date: "14/7/2025", amount: "$ 715.987,73" },
  { date: "21/7/2025", amount: "$ 177.102,35" },
  { date: "28/7/2025", amount: "$ 177.102,35" },
  { date: "4/8/2025", amount: "$ 190.029,47" },
  { date: "11/8/2025", amount: "$ 366.318,45" },
  { date: "18/8/2025", amount: "$ 366.318,45" },
  { date: "25/8/2025", amount: "$ 366.318,45" },
  { date: "1/9/2025", amount: "$ 904.403,88" },
  { date: "8/9/2025", amount: "$ 728.114,90" },
  { date: "15/9/2025", amount: "$ 957.562,90" },
  { date: "22/9/2025", amount: "$ 508.497,18" },
  { date: "29/9/2025", amount: "$ 4.798.494,64" },
  { date: "6/10/2025", amount: "$ 4.508.049,47" },
  { date: "13/10/2025", amount: "$ 318.542,86" },
  { date: "20/10/2025", amount: "$ 5.564.189,83" },
  { date: "27/10/2025", amount: "$ 318.542,86" },
  { date: "3/11/2025", amount: "$ 2.713.702,11" },
  { date: "10/11/2025", amount: "$ 6.811.176,12" },
  { date: "17/11/2025", amount: "$ 7.143.511,10" },
  { date: "24/11/2025", amount: "$ 462.223,95" },
  { date: "1/12/2025", amount: "$ 462.223,95" },
  { date: "8/12/2025", amount: "$ 579.069,67" },
  { date: "15/12/2025", amount: "$ 3.457.749,67" },
  { date: "22/12/2025", amount: "$ 2.052.806,14" },
  { date: "29/12/2025", amount: "$ 566.142,55" },
  { date: "5/1/2026", amount: "$ 566.142,55" },
  { date: "12/1/2026", amount: "$ 853.118,70" },
  { date: "19/1/2026", amount: "$ 4.373.280,53" },
  { date: "26/1/2026", amount: "$ 1.014.034,91" },
  { date: "2/2/2026", amount: "$ 1.014.034,91" },
  { date: "9/2/2026", amount: "$ 1.263.862,49" },
  { date: "16/2/2026", amount: "$ 1.198.777,67" },
  { date: "23/2/2026", amount: "$ 1.198.777,67" },
  { date: "2/3/2026", amount: "$ 2.057.603,53" },
  { date: "9/3/2026", amount: "$ 1.110.212,06" },
  { date: "16/3/2026", amount: "$ 1.110.212,06" },
  { date: "23/3/2026", amount: "$ 1.110.212,06" },
  { date: "30/3/2026", amount: "$ 1.110.212,06" },
  { date: "6/4/2026", amount: "$ 1.366.625,01" },
  { date: "13/4/2026", amount: "$ 2.930.803,46" },
  { date: "20/4/2026", amount: "$ 1.169.094,31" },
  { date: "27/4/2026", amount: "$ 1.169.094,31" },
  { date: "4/5/2026", amount: "$ 1.092.161,90" },
  { date: "11/5/2026", amount: "$ 749.100,64" },
  { date: "18/5/2026", amount: "$ 886.941,66" },
  { date: "25/5/2026", amount: "$ 568.525,61" },
  { date: "1/6/2026", amount: "$ 161.763,89" },
  { date: "8/6/2026", amount: "$ 144.190,06" },
  { date: "15/6/2026", amount: "$ 95.915,27" },
  { date: "22/6/2026", amount: "$ 95.915,27" },
  { date: "29/6/2026", amount: "$ 95.915,27" },
  { date: "6/7/2026", amount: "$ 95.915,27" },
  { date: "13/7/2026", amount: "$ 95.915,27" },
  { date: "20/7/2026", amount: "$ 37.825,44" },
  { date: "27/7/2026", amount: "$ 2.428.270,27" },
  { date: "3/8/2026", amount: "$ -" },
  { date: "10/8/2026", amount: "$ -" },
  { date: "17/8/2026", amount: "$ -" },
  { date: "24/8/2026", amount: "$ -" },
  { date: "31/8/2026", amount: "$ -" },
  { date: "7/9/2026", amount: "$ -" },
  { date: "14/9/2026", amount: "$ -" },
  { date: "21/9/2026", amount: "$ -" },
  { date: "28/9/2026", amount: "$ -" },
  { date: "5/10/2026", amount: "$ -" },
  { date: "12/10/2026", amount: "$ -" },
  { date: "19/10/2026", amount: "$ -" },
  { date: "26/10/2026", amount: "$ -" },
  { date: "2/11/2026", amount: "$ -" },
  { date: "9/11/2026", amount: "$ -" },
  { date: "16/11/2026", amount: "$ -" },
  { date: "23/11/2026", amount: "$ -" },
  { date: "30/11/2026", amount: "$ -" },
  { date: "7/12/2026", amount: "$ -" },
  { date: "14/12/2026", amount: "$ -" },
  { date: "21/12/2026", amount: "$ -" },
  { date: "28/12/2026", amount: "$ -" },
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
