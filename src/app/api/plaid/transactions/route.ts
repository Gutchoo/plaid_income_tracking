import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import {
  getAccounts,
  saveTransactions,
  updateTransactions,
  removeTransactions,
  getSyncCursor,
  saveSyncCursor,
  type Transaction,
} from '@/lib/data';

// POST: Sync transactions from Plaid (just pulls and stores, no matching)
export async function POST() {
  try {
    const accounts = getAccounts();

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'No connected accounts. Please connect a bank account first.' },
        { status: 400 }
      );
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    // Sync transactions from all accounts using cursor-based sync
    for (const account of accounts) {
      try {
        // Get existing cursor for this account, or start fresh
        const existingCursor = getSyncCursor(account.itemId);
        let cursor = existingCursor?.cursor || '';
        let hasMore = true;

        const addedTransactions: Transaction[] = [];
        const modifiedTransactions: Transaction[] = [];
        const removedTransactionIds: string[] = [];

        while (hasMore) {
          const response = await plaidClient.transactionsSync({
            access_token: account.accessToken,
            cursor: cursor || undefined,
          });

          // Process added transactions
          for (const txn of response.data.added) {
            addedTransactions.push({
              transactionId: txn.transaction_id,
              accountId: txn.account_id,
              itemId: account.itemId,
              amount: txn.amount,
              date: txn.date,
              name: txn.name,
              merchantName: txn.merchant_name || undefined,
              category: txn.category || undefined,
              pending: txn.pending,
            });
          }

          // Process modified transactions
          for (const txn of response.data.modified) {
            modifiedTransactions.push({
              transactionId: txn.transaction_id,
              accountId: txn.account_id,
              itemId: account.itemId,
              amount: txn.amount,
              date: txn.date,
              name: txn.name,
              merchantName: txn.merchant_name || undefined,
              category: txn.category || undefined,
              pending: txn.pending,
            });
          }

          // Process removed transactions
          for (const txn of response.data.removed) {
            if (txn.transaction_id) {
              removedTransactionIds.push(txn.transaction_id);
            }
          }

          hasMore = response.data.has_more;
          cursor = response.data.next_cursor;
        }

        // Save to local storage
        if (addedTransactions.length > 0) {
          saveTransactions(addedTransactions);
          totalAdded += addedTransactions.length;
        }

        if (modifiedTransactions.length > 0) {
          updateTransactions(modifiedTransactions);
          totalModified += modifiedTransactions.length;
        }

        if (removedTransactionIds.length > 0) {
          removeTransactions(removedTransactionIds);
          totalRemoved += removedTransactionIds.length;
        }

        // Save the cursor for next time
        saveSyncCursor({
          itemId: account.itemId,
          cursor: cursor,
          lastSynced: new Date().toISOString(),
        });

      } catch (error) {
        console.error(`Error fetching transactions for account ${account.institution}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    return NextResponse.json(
      { error: 'Failed to sync transactions' },
      { status: 500 }
    );
  }
}
