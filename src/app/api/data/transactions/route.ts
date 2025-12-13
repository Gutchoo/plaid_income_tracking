import { NextRequest, NextResponse } from 'next/server';
import { getTransactions, getTransactionsByDateRange, getDepositsByDateRange } from '@/lib/data';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const depositsOnly = searchParams.get('depositsOnly') === 'true';

  let transactions;

  if (startDate && endDate) {
    if (depositsOnly) {
      transactions = getDepositsByDateRange(startDate, endDate);
    } else {
      transactions = getTransactionsByDateRange(startDate, endDate);
    }
  } else {
    transactions = getTransactions();
    if (depositsOnly) {
      transactions = transactions.filter(t => t.amount < 0);
    }
  }

  // Convert amounts to positive for deposits (for display purposes)
  const formatted = transactions.map(t => ({
    ...t,
    displayAmount: Math.abs(t.amount),
    isDeposit: t.amount < 0,
  }));

  return NextResponse.json(formatted);
}
