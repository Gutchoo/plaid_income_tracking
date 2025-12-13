import { NextRequest, NextResponse } from 'next/server';
import { saveAccount, saveTransactions, getTransactions, saveCsvUpload, Account, Transaction, CsvUpload } from '@/lib/data';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: string;
  balance: string;
}

// Create a deterministic hash for transaction ID based on content
function createTransactionHash(
  accountMask: string,
  date: string,
  description: string,
  amount: number,
  type: string,
  balance: string
): string {
  const input = `${accountMask}|${date}|${description}|${amount}|${type}|${balance}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
  return `csv-${hash}`;
}

function parseCSV(content: string): ParsedTransaction[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must have a header row and at least one data row');
  }

  // Parse header to find column indices
  const header = lines[0].toLowerCase();
  const headerCols = parseCSVLine(header);

  // Find relevant columns - try common column names
  // Order matters - more specific names should come first
  const dateColNames = ['posting date', 'posted date', 'transaction date', 'trans date', 'date'];
  // IMPORTANT: 'description' must come before 'details' - Chase has both columns
  // 'details' in Chase just says "DEBIT" or "CREDIT", 'description' has the actual info
  const descColNames = ['description', 'desc', 'memo', 'payee', 'name', 'transaction', 'details'];
  const amountColNames = ['amount', 'amt', 'transaction amount'];
  const debitColNames = ['debit', 'withdrawal', 'withdrawals', 'money out'];
  const creditColNames = ['credit', 'deposit', 'deposits', 'money in'];
  const typeColNames = ['type', 'transaction type', 'trans type'];
  const balanceColNames = ['balance', 'running balance', 'account balance'];

  let dateIdx = findColumnIndex(headerCols, dateColNames);
  let descIdx = findColumnIndex(headerCols, descColNames);
  let amountIdx = findColumnIndex(headerCols, amountColNames);
  let debitIdx = findColumnIndex(headerCols, debitColNames);
  let creditIdx = findColumnIndex(headerCols, creditColNames);
  let typeIdx = findColumnIndex(headerCols, typeColNames);
  let balanceIdx = findColumnIndex(headerCols, balanceColNames);

  // Validate we found the necessary columns
  if (dateIdx === -1) {
    throw new Error('Could not find a date column. Expected columns like: Date, Transaction Date, Posted Date');
  }
  if (descIdx === -1) {
    throw new Error('Could not find a description column. Expected columns like: Description, Memo, Name');
  }
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    throw new Error('Could not find an amount column. Expected columns like: Amount, Debit, Credit');
  }

  // Detect if this is a Chase-style CSV (has 'details' column with DEBIT/CREDIT values)
  // Chase uses: positive = deposit (credit), negative = withdrawal (debit)
  // Plaid uses: positive = withdrawal (debit), negative = deposit (credit)
  // So for Chase CSVs, we need to flip the sign
  const detailsIdx = headerCols.findIndex(h => h.trim() === 'details');
  const isChaseFormat = detailsIdx !== -1;

  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);

    // Parse date
    const dateStr = cols[dateIdx]?.trim();
    if (!dateStr) continue;

    const date = parseDate(dateStr);
    if (!date) {
      console.warn(`Skipping row ${i + 1}: could not parse date "${dateStr}"`);
      continue;
    }

    // Parse description
    const description = cols[descIdx]?.trim() || 'Unknown';

    // Parse type and balance for hash generation
    const type = typeIdx !== -1 ? (cols[typeIdx]?.trim() || '') : '';
    const balance = balanceIdx !== -1 ? (cols[balanceIdx]?.trim() || '') : '';

    // Skip transactions with no balance (likely pending)
    if (balanceIdx !== -1 && !balance) {
      console.warn(`Skipping row ${i + 1}: no balance (likely pending transaction)`);
      continue;
    }

    // Parse amount
    let amount: number;
    if (amountIdx !== -1) {
      amount = parseAmount(cols[amountIdx]);

      // For Chase-style CSVs, flip the sign to match Plaid convention
      // Chase: positive = money in (deposit), negative = money out (debit)
      // Plaid: positive = money out (debit), negative = money in (deposit)
      if (isChaseFormat) {
        amount = -amount;
      }
    } else {
      // Separate debit/credit columns
      const debit = debitIdx !== -1 ? parseAmount(cols[debitIdx]) : 0;
      const credit = creditIdx !== -1 ? parseAmount(cols[creditIdx]) : 0;
      // Debits are money out (positive in Plaid), Credits are money in (negative in Plaid)
      amount = debit - credit;
    }

    if (isNaN(amount)) {
      console.warn(`Skipping row ${i + 1}: could not parse amount`);
      continue;
    }

    transactions.push({ date, description, amount, type, balance });
  }

  return transactions;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result.map(s => s.trim().replace(/^"|"$/g, ''));
}

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  // First pass: try exact matches (prioritized by order in possibleNames)
  for (const name of possibleNames) {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      if (header === name) {
        return i;
      }
    }
  }

  // Second pass: try partial matches (prioritized by order in possibleNames)
  for (const name of possibleNames) {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      if (header.includes(name)) {
        return i;
      }
    }
  }

  return -1;
}

function parseDate(dateStr: string): string | null {
  // Try various date formats
  const formats = [
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // MM-DD-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // YYYY/MM/DD
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    // MM/DD/YY
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year: number, month: number, day: number;

      if (format.source.startsWith('^(\\d{4})')) {
        // YYYY-MM-DD or YYYY/MM/DD format
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else if (match[3].length === 2) {
        // MM/DD/YY format
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = 2000 + parseInt(match[3]);
      } else {
        // MM/DD/YYYY or MM-DD-YYYY format
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      }

      // Validate
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        continue;
      }

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Try native Date parsing as fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

function parseAmount(amountStr: string | undefined): number {
  if (!amountStr) return 0;

  // Remove currency symbols, commas, and whitespace
  const cleaned = amountStr.replace(/[$,\s]/g, '').trim();

  // Handle parentheses as negative (accounting format)
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1));
  }

  return parseFloat(cleaned);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const institutionName = formData.get('institutionName') as string;
    const accountName = formData.get('accountName') as string;
    const accountMask = formData.get('accountMask') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!institutionName || !accountName) {
      return NextResponse.json({ error: 'Institution name and account name are required' }, { status: 400 });
    }

    if (!accountMask || accountMask.length !== 4) {
      return NextResponse.json({ error: 'Last 4 digits of account number are required' }, { status: 400 });
    }

    // Read file content
    const content = await file.text();

    // Parse CSV
    let parsedTransactions: ParsedTransaction[];
    try {
      parsedTransactions = parseCSV(content);
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Failed to parse CSV'
      }, { status: 400 });
    }

    if (parsedTransactions.length === 0) {
      return NextResponse.json({ error: 'No transactions found in CSV' }, { status: 400 });
    }

    // Create a deterministic account ID based on institution + account mask
    // This allows the same account to be recognized across uploads
    const accountIdHash = createHash('sha256')
      .update(`${institutionName}|${accountMask}`)
      .digest('hex')
      .slice(0, 16);
    const accountId = `csv-acct-${accountIdHash}`;
    const itemId = `csv-item-${accountIdHash}`;

    const account: Account = {
      id: itemId,
      institution: institutionName,
      institutionId: null,
      accessToken: '', // No access token for CSV imports
      itemId: itemId,
      linkedAccounts: [{
        accountId: accountId,
        name: accountName,
        officialName: accountName,
        type: 'depository',
        subtype: 'checking',
        mask: accountMask,
      }],
      createdAt: new Date().toISOString(),
    };

    // Convert to Transaction format with deterministic IDs based on content
    const transactions: Transaction[] = parsedTransactions.map((t) => ({
      transactionId: createTransactionHash(
        accountMask,
        t.date,
        t.description,
        t.amount,
        t.type,
        t.balance
      ),
      accountId: accountId,
      itemId: itemId,
      amount: t.amount,
      date: t.date,
      name: t.description,
      pending: false,
    }));

    // Save to data layer
    // saveAccount will update if account already exists
    saveAccount(account);

    // Count existing transactions before saving to report new vs skipped
    const existingTransactions = getTransactions();
    const existingIds = new Set(existingTransactions.map((t) => t.transactionId));
    const newTransactions = transactions.filter(t => !existingIds.has(t.transactionId));
    const skippedCount = transactions.length - newTransactions.length;

    // saveTransactions will skip duplicates (same transactionId)
    saveTransactions(transactions);

    // Calculate date range from transactions
    const dates = transactions.map(t => t.date).sort();
    const dateRangeStart = dates[0] || '';
    const dateRangeEnd = dates[dates.length - 1] || '';

    // Save CSV upload metadata (only if there are new transactions)
    if (newTransactions.length > 0) {
      const csvUpload: CsvUpload = {
        id: uuidv4(),
        accountId: itemId,
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        dateRangeStart,
        dateRangeEnd,
        transactionCount: newTransactions.length,
        transactionIds: newTransactions.map(t => t.transactionId),
      };
      saveCsvUpload(csvUpload);
    }

    return NextResponse.json({
      success: true,
      accountId: account.id,
      transactionCount: transactions.length,
      newTransactions: newTransactions.length,
      skippedDuplicates: skippedCount,
    });
  } catch (error) {
    console.error('CSV upload error:', error);
    return NextResponse.json({
      error: 'Failed to process CSV upload'
    }, { status: 500 });
  }
}
