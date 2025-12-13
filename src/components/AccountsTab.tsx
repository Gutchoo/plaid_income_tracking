'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, ChevronDown, Upload, Trash2, FileSpreadsheet } from 'lucide-react';
import { AddAccountDialog } from './AddAccountDialog';
import { ConfirmDialog } from './ConfirmDialog';

interface LinkedAccount {
  accountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
}

interface Account {
  id: string;
  institution: string;
  institutionId: string | null;
  linkedAccounts: LinkedAccount[];
  createdAt: string;
}

interface CsvUpload {
  id: string;
  accountId: string;
  filename: string;
  uploadedAt: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  transactionCount: number;
  transactionIds: string[];
}

interface AccountsTabProps {
  accounts: Account[];
  onRefresh: () => Promise<void>;
}

export function AccountsTab({ accounts, onRefresh }: AccountsTabProps) {
  const [csvUploads, setCsvUploads] = useState<CsvUpload[]>([]);
  const [openAccounts, setOpenAccounts] = useState<Set<string>>(new Set());
  const [uploadingToAccount, setUploadingToAccount] = useState<Account | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [deleteUploadId, setDeleteUploadId] = useState<string | null>(null);

  const fetchCsvUploads = async () => {
    const res = await fetch('/api/data/csv-uploads');
    const data = await res.json();
    setCsvUploads(data);
  };

  useEffect(() => {
    fetchCsvUploads();
  }, []);

  const toggleAccount = (accountId: string) => {
    setOpenAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const deleteAccount = async (accountId: string) => {
    await fetch('/api/data/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: accountId }),
    });
    setDeleteAccountId(null);
    await onRefresh();
    await fetchCsvUploads();
  };

  const deleteCsvUpload = async (uploadId: string) => {
    await fetch('/api/data/csv-uploads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });
    setDeleteUploadId(null);
    await onRefresh();
    await fetchCsvUploads();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setCsvFile(file);
      setError(null);
    }
  };

  const handleUploadToAccount = async () => {
    if (!csvFile || !uploadingToAccount) return;

    setUploading(true);
    setError(null);

    try {
      const linkedAccount = uploadingToAccount.linkedAccounts[0];
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('institutionName', uploadingToAccount.institution);
      formData.append('accountName', linkedAccount?.name || 'Account');
      formData.append('accountMask', linkedAccount?.mask || '0000');

      const response = await fetch('/api/data/csv-upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload CSV');
      }

      setUploadingToAccount(null);
      setCsvFile(null);
      await onRefresh();
      await fetchCsvUploads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload CSV');
    } finally {
      setUploading(false);
    }
  };

  const closeUploadDialog = () => {
    setUploadingToAccount(null);
    setCsvFile(null);
    setError(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endDate = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startDate} - ${endDate}`;
  };

  // Check if account is a CSV account (has uploads)
  const isCsvAccount = (accountId: string) => {
    return accountId.startsWith('csv-');
  };

  const getUploadsForAccount = (accountId: string) => {
    return csvUploads.filter(u => u.accountId === accountId);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <AddAccountDialog onSuccess={async () => {
          await onRefresh();
          await fetchCsvUploads();
        }} />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              No accounts connected yet. Click &quot;+ Add Account&quot; to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => {
            const uploads = getUploadsForAccount(account.id);
            const isOpen = openAccounts.has(account.id);
            const isCsv = isCsvAccount(account.id);

            return (
              <Card key={account.id} className="py-0 gap-0 overflow-hidden">
                <Collapsible open={isOpen} onOpenChange={() => toggleAccount(account.id)}>
                  <CollapsibleTrigger asChild>
                    <div className="px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        <div className="text-left">
                          <p className="font-semibold text-sm">{account.institution}</p>
                          {account.linkedAccounts && account.linkedAccounts.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {account.linkedAccounts[0].officialName || account.linkedAccounts[0].name}
                              {account.linkedAccounts[0].mask && ` ****${account.linkedAccounts[0].mask}`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {isCsv && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setUploadingToAccount(account); }}
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            Upload CSV
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setDeleteAccountId(account.id); }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <Separator />
                    <div className="p-4 bg-muted/30">
                      {isCsv ? (
                        uploads.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground mb-3">CSV Uploads</p>
                            {uploads.map((upload) => (
                              <div
                                key={upload.id}
                                className="flex items-center justify-between p-3 bg-background rounded-md border"
                              >
                                <div className="flex items-center gap-3">
                                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="text-sm font-medium">{upload.filename}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDateRange(upload.dateRangeStart, upload.dateRangeEnd)} · {upload.transactionCount} transactions
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Uploaded {formatDate(upload.uploadedAt)}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteUploadId(upload.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No CSV uploads yet. Click &quot;Upload CSV&quot; to add transactions.
                          </p>
                        )
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          <p>Connected via Plaid</p>
                          <p className="text-xs mt-1">
                            Transactions sync automatically when you click &quot;Sync Transactions&quot; on the Dashboard.
                          </p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload CSV to existing account dialog */}
      <Dialog open={!!uploadingToAccount} onOpenChange={(open) => !open && closeUploadDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload CSV to {uploadingToAccount?.institution}</DialogTitle>
            <DialogDescription>
              Upload a new CSV file to add more transactions to this account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <label
              htmlFor="csv-file-upload"
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors block"
            >
              <input
                id="csv-file-upload"
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="sr-only"
              />
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {csvFile ? (
                <p className="text-sm font-medium">{csvFile.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click to select a CSV file
                </p>
              )}
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeUploadDialog}>
              Cancel
            </Button>
            <Button onClick={handleUploadToAccount} disabled={!csvFile || uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete account confirmation */}
      <ConfirmDialog
        open={!!deleteAccountId}
        onOpenChange={(open) => !open && setDeleteAccountId(null)}
        title="Delete Account"
        description="Are you sure you want to delete this account? This will also delete all transactions and CSV uploads associated with it."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteAccountId && deleteAccount(deleteAccountId)}
      />

      {/* Delete CSV upload confirmation */}
      <ConfirmDialog
        open={!!deleteUploadId}
        onOpenChange={(open) => !open && setDeleteUploadId(null)}
        title="Delete CSV Upload"
        description="Are you sure you want to delete this CSV upload? This will also delete all transactions from this upload."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteUploadId && deleteCsvUpload(deleteUploadId)}
      />
    </div>
  );
}
