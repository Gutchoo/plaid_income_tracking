import { NextRequest, NextResponse } from 'next/server';
import {
  getCsvUploads,
  deleteCsvUpload,
  getTransactions,
  getTenantTransactions,
  getRejectedMatches,
} from '@/lib/data';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// GET - List all CSV uploads (optionally filtered by accountId)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    let uploads = getCsvUploads();

    if (accountId) {
      uploads = uploads.filter(u => u.accountId === accountId);
    }

    return NextResponse.json(uploads);
  } catch (error) {
    console.error('Error getting CSV uploads:', error);
    return NextResponse.json(
      { error: 'Failed to get CSV uploads' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a specific CSV upload and its transactions
export async function DELETE(request: NextRequest) {
  try {
    const { uploadId } = await request.json();

    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 });
    }

    // Get the upload to find its transaction IDs
    const upload = deleteCsvUpload(uploadId);

    if (!upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    const transactionIdsToDelete = new Set(upload.transactionIds);

    // Remove transactions belonging to this upload
    const allTransactions = getTransactions();
    const remainingTransactions = allTransactions.filter(
      t => !transactionIdsToDelete.has(t.transactionId)
    );
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

    return NextResponse.json({
      success: true,
      deletedTransactions: upload.transactionIds.length,
    });
  } catch (error) {
    console.error('Error deleting CSV upload:', error);
    return NextResponse.json(
      { error: 'Failed to delete CSV upload' },
      { status: 500 }
    );
  }
}
