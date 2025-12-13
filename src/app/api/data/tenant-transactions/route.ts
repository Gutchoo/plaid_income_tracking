import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantTransactions,
  getTenantTransactionByTransactionId,
  addTenantTransaction,
  removeTenantTransaction,
  addRejectedMatch,
  removeRejectedMatch,
} from '@/lib/data';

// GET: Get all tenant-transaction links
export async function GET() {
  const tenantTransactions = getTenantTransactions();
  return NextResponse.json(tenantTransactions);
}

// POST: Add a transaction to a tenant (manual assignment)
export async function POST(request: NextRequest) {
  const { tenantId, transactionId } = await request.json();

  if (!tenantId || !transactionId) {
    return NextResponse.json(
      { error: 'tenantId and transactionId are required' },
      { status: 400 }
    );
  }

  // If user manually assigns, remove from rejected list (they changed their mind)
  removeRejectedMatch(tenantId, transactionId);

  addTenantTransaction(tenantId, transactionId, true); // manual assignment
  return NextResponse.json({ success: true });
}

// DELETE: Remove a transaction from a tenant
export async function DELETE(request: NextRequest) {
  const { transactionId } = await request.json();

  if (!transactionId) {
    return NextResponse.json(
      { error: 'transactionId is required' },
      { status: 400 }
    );
  }

  // Find the tenant this was assigned to before removing
  const assignment = getTenantTransactionByTransactionId(transactionId);

  if (assignment) {
    // Add to rejected matches so auto-match won't re-assign
    addRejectedMatch(assignment.tenantId, transactionId);
  }

  removeTenantTransaction(transactionId);
  return NextResponse.json({ success: true });
}
