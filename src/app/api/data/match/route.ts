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
        let isMatch = false;

        // Check based on match mode (default to searchTerms for backward compatibility)
        const matchMode = tenant.matchMode || 'searchTerms';

        if (matchMode === 'exactAmounts') {
          // Exact amount matching - check if amount matches any specified amount
          const exactAmounts = tenant.exactAmounts || [];
          isMatch = exactAmounts.some(amount =>
            Math.abs(depositAmount - amount) < 0.01 // Handle floating point comparison
          );
        } else {
          // Search terms mode - check amount tolerance + search terms
          const minAmount = tenant.expectedRent - tenant.tolerance;
          const maxAmount = tenant.expectedRent + tenant.tolerance;

          if (depositAmount >= minAmount && depositAmount <= maxAmount) {
            // Check search terms (skip empty strings)
            isMatch = tenant.searchTerms.some(term =>
              term.trim() !== '' && description.includes(term.toUpperCase())
            );
          }
        }

        if (isMatch) {
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
