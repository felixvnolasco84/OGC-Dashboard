export function calculateProviderStatsDelta(args: {
  currentProviderTransactionCount: number;
  currentProviderTotalAmount: number;
  currentProviderProjectCount: number;
  currentProjectTransactionCount: number;
  currentProjectTotalAmount: number;
  transactionAmount: number;
  direction: 1 | -1;
}) {
  const projectTransactionCount = Math.max(
    0,
    args.currentProjectTransactionCount + args.direction,
  );
  const projectAdded = args.currentProjectTransactionCount === 0 && projectTransactionCount > 0;
  const projectRemoved = args.currentProjectTransactionCount > 0 && projectTransactionCount === 0;
  return {
    providerTransactionCount: Math.max(
      0,
      args.currentProviderTransactionCount + args.direction,
    ),
    providerTotalAmount: Math.round(
      (args.currentProviderTotalAmount + args.direction * args.transactionAmount) * 100,
    ) / 100,
    providerProjectCount: Math.max(
      0,
      args.currentProviderProjectCount + (projectAdded ? 1 : projectRemoved ? -1 : 0),
    ),
    projectTransactionCount,
    projectTotalAmount: Math.round(
      (args.currentProjectTotalAmount + args.direction * args.transactionAmount) * 100,
    ) / 100,
    projectAdded,
    projectRemoved,
  };
}
