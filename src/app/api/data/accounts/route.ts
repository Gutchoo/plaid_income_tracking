import { NextRequest, NextResponse } from 'next/server';
import {
  getAccounts,
  deleteAccount,
  getTransactions,
  getTenantTransactions,
  getRejectedMatches,
  deleteCsvUploadsForAccount,
} from '@/lib/data';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    const accounts = getAccounts();
    // Don't expose access tokens to the client
    const safeAccounts = accounts.map(({ accessToken, ...rest }) => rest);
    return NextResponse.json(safeAccounts);
  } catch (error) {
    console.error('Error getting accounts:', error);
    return NextResponse.json(
      { error: 'Failed to get accounts' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    // Get all transactions for this account (by itemId)
    const allTransactions = getTransactions();
    const transactionsToDelete = allTransactions.filter(t => t.itemId === id);
    const transactionIdsToDelete = new Set(transactionsToDelete.map(t => t.transactionId));

    // Remove transactions belonging to this account
    const remainingTransactions = allTransactions.filter(t => t.itemId !== id);
    writeJsonFile('transactions.json', remainingTransactions);

    // Remove tenant-transaction links for deleted transactions
    const tenantTransactions = getTenantTransactions();
    const remainingTenantTransactions = tenantTransactions.filter(
      tt => !transactionIdsToDelete.has(tt.transactionId)
    );
    writeJsonFile('tenant-transactions.json', remainingTenantTransactions);

    // Remove rejected matches for deleted transactions
    const rejectedMatches = getRejectedMatches();
    const remainingRejectedMatches = rejectedMatches.filter(
      rm => !transactionIdsToDelete.has(rm.transactionId)
    );
    writeJsonFile('rejected-matches.json', remainingRejectedMatches);

    // Delete CSV upload metadata for this account
    deleteCsvUploadsForAccount(id);

    // Finally, delete the account
    deleteAccount(id);

    return NextResponse.json({
      success: true,
      deletedTransactions: transactionsToDelete.length
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
