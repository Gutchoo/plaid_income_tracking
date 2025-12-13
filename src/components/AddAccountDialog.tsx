'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { Building2, Upload, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddAccountDialogProps {
  onSuccess: () => void;
}

type Step = 'choose-method' | 'account-details' | 'csv-upload';
type ConnectionMethod = 'plaid' | 'csv';

export function AddAccountDialog({ onSuccess }: AddAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('choose-method');
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountMask, setAccountMask] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loadingPlaid, setLoadingPlaid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setStep('choose-method');
      setConnectionMethod(null);
      setAccountName('');
      setAccountMask('');
      setInstitutionName('');
      setCsvFile(null);
      setError(null);
      setLinkToken(null);
    }
  };

  // Plaid Link handlers
  const onPlaidSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      try {
        await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken,
            institutionName: metadata.institution?.name || 'Unknown',
            institutionId: metadata.institution?.institution_id || null,
          }),
        });
        setLinkToken(null);
        handleOpenChange(false);
        onSuccess();
      } catch (error) {
        console.error('Error exchanging token:', error);
        setError('Failed to connect bank account');
      }
    },
    [onSuccess]
  );

  const onPlaidExit = useCallback(() => {
    setLinkToken(null);
  }, []);

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  // Open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && plaidReady) {
      openPlaidLink();
    }
  }, [linkToken, plaidReady, openPlaidLink]);

  const handlePlaidConnect = async () => {
    setLoadingPlaid(true);
    setError(null);
    try {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      });
      const data = await response.json();
      setLinkToken(data.linkToken);
    } catch (error) {
      console.error('Error getting link token:', error);
      setError('Failed to initialize bank connection');
    }
    setLoadingPlaid(false);
  };

  const handleMethodSelect = (method: ConnectionMethod) => {
    setConnectionMethod(method);
    if (method === 'plaid') {
      handlePlaidConnect();
    } else {
      setStep('account-details');
    }
  };

  const handleAccountDetailsNext = () => {
    if (!institutionName.trim()) {
      setError('Please enter a bank/institution name');
      return;
    }
    if (!accountName.trim()) {
      setError('Please enter an account name');
      return;
    }
    if (!accountMask.trim() || accountMask.length !== 4) {
      setError('Please enter the last 4 digits of the account number');
      return;
    }
    setError(null);
    setStep('csv-upload');
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

  const handleUpload = async () => {
    if (!csvFile) {
      setError('Please select a CSV file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('institutionName', institutionName);
      formData.append('accountName', accountName);
      formData.append('accountMask', accountMask);

      const response = await fetch('/api/data/csv-upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload CSV');
      }

      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload CSV');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>+ Add Account</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === 'choose-method' && (
          <>
            <DialogHeader>
              <DialogTitle>Add Account</DialogTitle>
              <DialogDescription>
                Choose how you want to connect your bank account
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <button
                onClick={() => handleMethodSelect('plaid')}
                disabled={loadingPlaid}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent transition-colors text-left"
              >
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Link2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Connect with Plaid</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync transactions from your bank
                  </p>
                </div>
              </button>
              <button
                onClick={() => handleMethodSelect('csv')}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent transition-colors text-left"
              >
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Upload CSV</p>
                  <p className="text-sm text-muted-foreground">
                    Import transactions from a bank statement export
                  </p>
                </div>
              </button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {step === 'account-details' && (
          <>
            <DialogHeader>
              <DialogTitle>Account Details</DialogTitle>
              <DialogDescription>
                Enter details about the bank account
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="institutionName">Bank / Institution Name</Label>
                <Input
                  id="institutionName"
                  placeholder="e.g., Chase, Bank of America"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountName">Account Name</Label>
                <Input
                  id="accountName"
                  placeholder="e.g., Business Checking"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountMask">Last 4 Digits of Account Number</Label>
                <Input
                  id="accountMask"
                  placeholder="e.g., 1234"
                  maxLength={4}
                  value={accountMask}
                  onChange={(e) => setAccountMask(e.target.value.replace(/\D/g, ''))}
                />
                <p className="text-xs text-muted-foreground">Required for duplicate detection</p>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('choose-method')}>
                Back
              </Button>
              <Button onClick={handleAccountDetailsNext}>
                Next
              </Button>
            </div>
          </>
        )}

        {step === 'csv-upload' && (
          <>
            <DialogHeader>
              <DialogTitle>Upload CSV</DialogTitle>
              <DialogDescription>
                Upload a CSV file exported from your bank. The file should have columns for date, description, and amount.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <label
                htmlFor="csv-file-input"
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors block"
              >
                <input
                  id="csv-file-input"
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
              <div className="text-xs text-muted-foreground">
                <p className="font-medium mb-1">Expected CSV format:</p>
                <p>Date, Description, Amount (negative for deposits)</p>
                <p className="mt-1">Most bank exports will work automatically.</p>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('account-details')}>
                Back
              </Button>
              <Button onClick={handleUpload} disabled={!csvFile || uploading}>
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
