import { NextResponse } from 'next/server';
import {
  getTenants,
  getTransactions,
  getTenantTransactions,
  addTenantTransaction,
  isMatchRejected,
} from '@/lib/data';

// POST: Run automatic matching on all unassigned deposit transactions
export async function POST() {
  try {
    const tenants = getTenants();
    const allTransactions = getTransactions();
    const existingAssignments = getTenantTransactions();

    // Get all deposit transactions (negative amounts = money in)
    const deposits = allTransactions.filter(t => t.amount < 0);

    // Get set of already-assigned transaction IDs
    const assignedIds = new Set(existingAssignments.map(tt => tt.transactionId));

    let matchedCount = 0;

    for (const deposit of deposits) {
      // Skip if already assigned
      if (assignedIds.has(deposit.transactionId)) {
        continue;
      }

      const description = `${deposit.name} ${deposit.merchantName || ''}`.toUpperCase();

      for (const tenant of tenants) {
        // Skip if user previously rejected this match
        if (isMatchRejected(tenant.id, deposit.transactionId)) {
          continue;
        }

        const depositAmount = Math.abs(deposit.amount);
        const minAmount = tenant.expectedRent - tenant.tolerance;
        const maxAmount = tenant.expectedRent + tenant.tolerance;

        // Check amount
        if (depositAmount < minAmount || depositAmount > maxAmount) {
          continue;
        }

        // Check search terms
        const termMatch = tenant.searchTerms.some(term =>
          description.includes(term.toUpperCase())
        );

        if (termMatch) {
          // Auto-assign this transaction to the tenant
          addTenantTransaction(tenant.id, deposit.transactionId, false);
          assignedIds.add(deposit.transactionId); // Prevent double-matching
          matchedCount++;
          break; // One transaction can only match one tenant
        }
      }
    }

    return NextResponse.json({
      success: true,
      matched: matchedCount,
    });
  } catch (error) {
    console.error('Error running auto-match:', error);
    return NextResponse.json(
      { error: 'Failed to run auto-match' },
      { status: 500 }
    );
  }
}
