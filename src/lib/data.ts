import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface LinkedAccount {
  accountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null; // last 4 digits
}

export interface Account {
  id: string;
  institution: string;
  institutionId: string | null;
  accessToken: string;
  itemId: string;
  linkedAccounts: LinkedAccount[];
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  property: string;
  expectedRent: number;
  tolerance: number;
  searchTerms: string[];
  accountId: string; // which account to look for payments in
  matchMode: 'searchTerms' | 'exactAmounts'; // how to match transactions
  exactAmounts: number[]; // for exactAmounts mode - match these specific amounts
}

export interface RentPayment {
  id: string;
  tenantId: string;
  month: string; // YYYY-MM format
  status: 'paid' | 'unpaid' | 'partial';
  amount?: number;
  date?: string;
  transactionId?: string;
  transactionDesc?: string;
  manualOverride?: boolean;
}

// Links a transaction to a tenant (many transactions can be linked to one tenant)
export interface TenantTransaction {
  id: string;              // unique ID for this link
  tenantId: string;
  transactionId: string;
  manualOverride: boolean; // true if user manually assigned, false if auto-matched
}

// Tracks when a user explicitly removes an auto-matched transaction (so it won't re-match)
export interface RejectedMatch {
  tenantId: string;
  transactionId: string;
}

export interface Transaction {
  transactionId: string;
  accountId: string;       // Plaid account ID
  itemId: string;          // Plaid item ID (bank connection)
  amount: number;          // Positive = money out, Negative = money in (deposit)
  date: string;            // YYYY-MM-DD
  name: string;
  merchantName?: string;
  category?: string[];
  pending: boolean;
}

export interface SyncCursor {
  itemId: string;          // Plaid item ID (bank connection)
  cursor: string;          // Plaid cursor for incremental sync
  lastSynced: string;      // ISO timestamp
}

export interface CsvUpload {
  id: string;              // Unique upload ID
  accountId: string;       // Links to the account (itemId)
  filename: string;        // Original CSV filename
  uploadedAt: string;      // ISO timestamp
  dateRangeStart: string;  // Earliest transaction date (YYYY-MM-DD)
  dateRangeEnd: string;    // Latest transaction date (YYYY-MM-DD)
  transactionCount: number; // How many transactions in this upload
  transactionIds: string[]; // IDs of transactions from this upload (for deletion)
}

function getFilePath(filename: string): string {
  return path.join(DATA_DIR, filename);
}

function readJsonFile<T>(filename: string, defaultValue: T): T {
  const filePath = getFilePath(filename);
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = getFilePath(filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Accounts
export function getAccounts(): Account[] {
  return readJsonFile<Account[]>('accounts.json', []);
}

export function saveAccount(account: Account): void {
  const accounts = getAccounts();
  const existingIndex = accounts.findIndex(a => a.id === account.id);
  if (existingIndex >= 0) {
    accounts[existingIndex] = account;
  } else {
    accounts.push(account);
  }
  writeJsonFile('accounts.json', accounts);
}

export function deleteAccount(id: string): void {
  const accounts = getAccounts().filter(a => a.id !== id);
  writeJsonFile('accounts.json', accounts);
}

// Tenants
export function getTenants(): Tenant[] {
  return readJsonFile<Tenant[]>('tenants.json', []);
}

export function saveTenant(tenant: Tenant): void {
  const tenants = getTenants();
  const existingIndex = tenants.findIndex(t => t.id === tenant.id);
  if (existingIndex >= 0) {
    tenants[existingIndex] = tenant;
  } else {
    tenants.push(tenant);
  }
  writeJsonFile('tenants.json', tenants);
}

export function deleteTenant(id: string): void {
  const tenants = getTenants().filter(t => t.id !== id);
  writeJsonFile('tenants.json', tenants);
}

// Rent Payments
export function getRentPayments(): RentPayment[] {
  return readJsonFile<RentPayment[]>('rent-payments.json', []);
}

export function saveRentPayment(payment: RentPayment): void {
  const payments = getRentPayments();
  const existingIndex = payments.findIndex(
    p => p.tenantId === payment.tenantId && p.month === payment.month
  );
  if (existingIndex >= 0) {
    payments[existingIndex] = payment;
  } else {
    payments.push(payment);
  }
  writeJsonFile('rent-payments.json', payments);
}

export function getRentPaymentsForMonth(month: string): RentPayment[] {
  return getRentPayments().filter(p => p.month === month);
}

// Transactions
export function getTransactions(): Transaction[] {
  return readJsonFile<Transaction[]>('transactions.json', []);
}

export function getTransactionsByDateRange(startDate: string, endDate: string): Transaction[] {
  return getTransactions().filter(t => t.date >= startDate && t.date <= endDate);
}

export function getDeposits(): Transaction[] {
  return getTransactions().filter(t => t.amount < 0);
}

export function getDepositsByDateRange(startDate: string, endDate: string): Transaction[] {
  return getTransactions().filter(t => t.amount < 0 && t.date >= startDate && t.date <= endDate);
}

export function saveTransactions(transactions: Transaction[]): void {
  const existing = getTransactions();
  const existingIds = new Set(existing.map(t => t.transactionId));

  // Add new transactions
  const newTransactions = transactions.filter(t => !existingIds.has(t.transactionId));
  const updated = [...existing, ...newTransactions];

  writeJsonFile('transactions.json', updated);
}

export function updateTransactions(transactions: Transaction[]): void {
  const existing = getTransactions();
  const updateMap = new Map(transactions.map(t => [t.transactionId, t]));

  const updated = existing.map(t => updateMap.get(t.transactionId) || t);
  writeJsonFile('transactions.json', updated);
}

export function removeTransactions(transactionIds: string[]): void {
  const idsToRemove = new Set(transactionIds);
  const transactions = getTransactions().filter(t => !idsToRemove.has(t.transactionId));
  writeJsonFile('transactions.json', transactions);
}

// Sync Cursors
export function getSyncCursors(): SyncCursor[] {
  return readJsonFile<SyncCursor[]>('sync-cursors.json', []);
}

export function getSyncCursor(itemId: string): SyncCursor | undefined {
  return getSyncCursors().find(c => c.itemId === itemId);
}

export function saveSyncCursor(cursor: SyncCursor): void {
  const cursors = getSyncCursors();
  const existingIndex = cursors.findIndex(c => c.itemId === cursor.itemId);
  if (existingIndex >= 0) {
    cursors[existingIndex] = cursor;
  } else {
    cursors.push(cursor);
  }
  writeJsonFile('sync-cursors.json', cursors);
}

// Tenant Transactions (links between tenants and transactions)
export function getTenantTransactions(): TenantTransaction[] {
  return readJsonFile<TenantTransaction[]>('tenant-transactions.json', []);
}

export function getTenantTransactionsForTenant(tenantId: string): TenantTransaction[] {
  return getTenantTransactions().filter(tt => tt.tenantId === tenantId);
}

export function getTenantTransactionByTransactionId(transactionId: string): TenantTransaction | undefined {
  return getTenantTransactions().find(tt => tt.transactionId === transactionId);
}

export function addTenantTransaction(tenantId: string, transactionId: string, manualOverride: boolean): void {
  const existing = getTenantTransactions();

  // Check if this transaction is already assigned
  const alreadyAssigned = existing.find(tt => tt.transactionId === transactionId);
  if (alreadyAssigned) {
    return; // Don't duplicate
  }

  existing.push({
    id: `${tenantId}-${transactionId}`,
    tenantId,
    transactionId,
    manualOverride,
  });

  writeJsonFile('tenant-transactions.json', existing);
}

export function removeTenantTransaction(transactionId: string): void {
  const transactions = getTenantTransactions().filter(tt => tt.transactionId !== transactionId);
  writeJsonFile('tenant-transactions.json', transactions);
}

export function removeTenantTransactionsForTenant(tenantId: string): void {
  const transactions = getTenantTransactions().filter(tt => tt.tenantId !== tenantId);
  writeJsonFile('tenant-transactions.json', transactions);
}

// Re-evaluate auto-matched transactions for a tenant after their criteria change
// Removes auto-matched transactions that no longer match, keeps manual ones
export function reEvaluateTenantMatches(tenant: Tenant): number {
  const tenantTransactions = getTenantTransactions();
  const allTransactions = getTransactions();

  // Get auto-matched transactions for this tenant (not manually assigned)
  const autoMatched = tenantTransactions.filter(
    tt => tt.tenantId === tenant.id && !tt.manualOverride
  );

  const transactionsToRemove: string[] = [];
  const matchMode = tenant.matchMode || 'searchTerms';

  for (const tt of autoMatched) {
    const transaction = allTransactions.find(t => t.transactionId === tt.transactionId);
    if (!transaction) {
      // Transaction no longer exists, remove the link
      transactionsToRemove.push(tt.transactionId);
      continue;
    }

    const depositAmount = Math.abs(transaction.amount);
    let stillMatches = false;

    if (matchMode === 'exactAmounts') {
      // Exact amount matching
      const exactAmounts = tenant.exactAmounts || [];
      stillMatches = exactAmounts.some(amount =>
        Math.abs(depositAmount - amount) < 0.01
      );
    } else {
      // Search terms mode
      const description = `${transaction.name} ${transaction.merchantName || ''}`.toUpperCase();
      const minAmount = tenant.expectedRent - tenant.tolerance;
      const maxAmount = tenant.expectedRent + tenant.tolerance;

      if (depositAmount >= minAmount && depositAmount <= maxAmount) {
        stillMatches = tenant.searchTerms.some(term =>
          term.trim() !== '' && description.includes(term.toUpperCase())
        );
      }
    }

    if (!stillMatches) {
      transactionsToRemove.push(tt.transactionId);
    }
  }

  // Remove transactions that no longer match
  if (transactionsToRemove.length > 0) {
    const remaining = tenantTransactions.filter(
      tt => !transactionsToRemove.includes(tt.transactionId)
    );
    writeJsonFile('tenant-transactions.json', remaining);
  }

  return transactionsToRemove.length;
}

// Rejected Matches (prevents auto-matching from re-assigning removed transactions)
export function getRejectedMatches(): RejectedMatch[] {
  return readJsonFile<RejectedMatch[]>('rejected-matches.json', []);
}

export function addRejectedMatch(tenantId: string, transactionId: string): void {
  const existing = getRejectedMatches();

  // Check if already rejected
  const alreadyRejected = existing.find(
    rm => rm.tenantId === tenantId && rm.transactionId === transactionId
  );
  if (alreadyRejected) {
    return;
  }

  existing.push({ tenantId, transactionId });
  writeJsonFile('rejected-matches.json', existing);
}

export function isMatchRejected(tenantId: string, transactionId: string): boolean {
  return getRejectedMatches().some(
    rm => rm.tenantId === tenantId && rm.transactionId === transactionId
  );
}

export function removeRejectedMatch(tenantId: string, transactionId: string): void {
  const rejected = getRejectedMatches().filter(
    rm => !(rm.tenantId === tenantId && rm.transactionId === transactionId)
  );
  writeJsonFile('rejected-matches.json', rejected);
}

export function removeRejectedMatchesForTenant(tenantId: string): void {
  const rejected = getRejectedMatches().filter(rm => rm.tenantId !== tenantId);
  writeJsonFile('rejected-matches.json', rejected);
}

// CSV Uploads
export function getCsvUploads(): CsvUpload[] {
  return readJsonFile<CsvUpload[]>('csv-uploads.json', []);
}

export function getCsvUploadsForAccount(accountId: string): CsvUpload[] {
  return getCsvUploads().filter(u => u.accountId === accountId);
}

export function saveCsvUpload(upload: CsvUpload): void {
  const uploads = getCsvUploads();
  const existingIndex = uploads.findIndex(u => u.id === upload.id);
  if (existingIndex >= 0) {
    uploads[existingIndex] = upload;
  } else {
    uploads.push(upload);
  }
  writeJsonFile('csv-uploads.json', uploads);
}

export function deleteCsvUpload(uploadId: string): CsvUpload | null {
  const uploads = getCsvUploads();
  const upload = uploads.find(u => u.id === uploadId);
  if (!upload) return null;

  const remaining = uploads.filter(u => u.id !== uploadId);
  writeJsonFile('csv-uploads.json', remaining);
  return upload;
}

export function deleteCsvUploadsForAccount(accountId: string): void {
  const uploads = getCsvUploads().filter(u => u.accountId !== accountId);
  writeJsonFile('csv-uploads.json', uploads);
}
