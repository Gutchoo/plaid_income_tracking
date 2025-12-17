'use client';

import { useState, useEffect, DragEvent } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Users, GripVertical, X, Sun, Moon, ChevronDown, ChevronRight, Check, Search, FileDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTheme } from 'next-themes';
import { AccountsTab } from '@/components/AccountsTab';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';

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

interface Tenant {
  id: string;
  name: string;
  property: string;
  expectedRent: number;
  tolerance: number;
  searchTerms: string[];
  accountId: string;
  matchMode: 'searchTerms' | 'exactAmounts';
  exactAmounts: number[];
}

interface Transaction {
  transactionId: string;
  accountId: string;
  itemId: string;
  amount: number;
  date: string;
  name: string;
  merchantName?: string;
  displayAmount: number;
  isDeposit: boolean;
}

interface TenantTransaction {
  id: string;
  tenantId: string;
  transactionId: string;
  manualOverride: boolean;
}

type Tab = 'dashboard' | 'accounts' | 'tenants';

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantTransactions, setTenantTransactions] = useState<TenantTransaction[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [draggedTransaction, setDraggedTransaction] = useState<Transaction | null>(null);
  const [dropTargetTenant, setDropTargetTenant] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [collapsedTenants, setCollapsedTenants] = useState<Set<string>>(new Set());

  const [startDate, setStartDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  });

  // Helper to format date as YYYY-MM-DD for API calls
  const formatDateForApi = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Transaction filters
  const [filterAccountIds, setFilterAccountIds] = useState<string[]>([]);
  const [filterMinAmount, setFilterMinAmount] = useState<string>('');
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');

  const fetchAccounts = async () => {
    const res = await fetch('/api/data/accounts');
    const data = await res.json();
    setAccounts(data);
  };

  const fetchTenants = async () => {
    const res = await fetch('/api/data/tenants');
    const data = await res.json();
    setTenants(data);
  };

  const fetchTenantTransactions = async () => {
    const res = await fetch('/api/data/tenant-transactions');
    const data = await res.json();
    setTenantTransactions(data);
  };

  const fetchTransactions = async () => {
    const res = await fetch(`/api/data/transactions?startDate=${formatDateForApi(startDate)}&endDate=${formatDateForApi(endDate)}&depositsOnly=true`);
    const data = await res.json();
    setTransactions(data);
  };

  const fetchAllTransactions = async () => {
    const res = await fetch('/api/data/transactions?depositsOnly=true');
    const data = await res.json();
    setAllTransactions(data);
  };

  const runAutoMatch = async () => {
    await fetch('/api/data/match', { method: 'POST' });
    await fetchTenantTransactions();
  };

  useEffect(() => {
    const initializeData = async () => {
      await fetchAccounts();
      await fetchTenants();
      await fetchAllTransactions();
      await runAutoMatch();
    };
    initializeData();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [startDate, endDate]);

  const syncTransactions = async () => {
    setSyncing(true);
    try {
      await fetch('/api/plaid/transactions', { method: 'POST' });
      await fetchTransactions();
      await fetchAllTransactions();
      await runAutoMatch();
    } catch (error) {
      console.error('Error syncing:', error);
    }
    setSyncing(false);
  };

  const assignTransactionToTenant = async (transaction: Transaction, tenantId: string) => {
    await fetch('/api/data/tenant-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        transactionId: transaction.transactionId,
      }),
    });
    await fetchTenantTransactions();
  };

  const removeTransactionFromTenant = async (transactionId: string) => {
    await fetch('/api/data/tenant-transactions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    });
    await fetchTenantTransactions();
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, transaction: Transaction) => {
    setDraggedTransaction(transaction);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTransaction(null);
    setDropTargetTenant(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, tenantId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetTenant(tenantId);
  };

  const handleDragLeave = () => {
    setDropTargetTenant(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, tenantId: string) => {
    e.preventDefault();
    if (draggedTransaction) {
      assignTransactionToTenant(draggedTransaction, tenantId);
    }
    setDraggedTransaction(null);
    setDropTargetTenant(null);
  };

  const assignedTransactionIds = new Set(
    tenantTransactions.map(tt => tt.transactionId)
  );

  // Apply filters to transactions
  const filteredTransactions = transactions.filter(t => {
    if (filterAccountIds.length > 0 && !filterAccountIds.includes(t.itemId)) return false;
    if (filterMinAmount && t.displayAmount < parseFloat(filterMinAmount)) return false;
    if (filterMaxAmount && t.displayAmount > parseFloat(filterMaxAmount)) return false;
    if (filterSearch) {
      const searchLower = filterSearch.toLowerCase();
      const nameMatch = t.name.toLowerCase().includes(searchLower);
      const merchantMatch = t.merchantName?.toLowerCase().includes(searchLower);
      if (!nameMatch && !merchantMatch) return false;
    }
    return true;
  });

  const unassignedTransactions = filteredTransactions.filter(
    t => !assignedTransactionIds.has(t.transactionId)
  );

  const getTransactionsForTenant = (tenantId: string): Transaction[] => {
    const tenantTxnIds = tenantTransactions
      .filter(tt => tt.tenantId === tenantId)
      .map(tt => tt.transactionId);
    return allTransactions
      .filter(t => tenantTxnIds.includes(t.transactionId))
      .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
  };

  const getAccountDisplayName = (itemId: string): string => {
    const account = accounts.find(a => a.id === itemId);
    if (!account) return '';
    const mask = account.linkedAccounts?.[0]?.mask;
    return `${account.institution}${mask ? ` ****${mask}` : ''}`;
  };

  const hasActiveFilters = filterAccountIds.length > 0 || filterMinAmount !== '' || filterMaxAmount !== '' || filterSearch !== '';

  const resetFilters = () => {
    setFilterAccountIds([]);
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setFilterSearch('');
  };

  const toggleAccountFilter = (accountId: string) => {
    setFilterAccountIds(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const toggleTenantCollapse = (tenantId: string) => {
    setCollapsedTenants(prev => {
      const next = new Set(prev);
      if (next.has(tenantId)) {
        next.delete(tenantId);
      } else {
        next.add(tenantId);
      }
      return next;
    });
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'accounts': return 'Connected Accounts';
      case 'tenants': return 'Tenants';
    }
  };

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <SidebarInset className="max-h-svh overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b px-6 shrink-0">
          <h1 className="text-lg font-semibold">{getPageTitle()}</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-8 w-8"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </header>

        <main className="flex-1 p-6 flex flex-col min-h-0">
          {/* Dashboard */}
          {activeTab === 'dashboard' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 min-h-0">
                {/* Deposits */}
                <Card className="flex flex-col min-h-0">
                  <CardHeader className="pb-3 shrink-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs justify-between min-w-[140px]"
                          >
                            {filterAccountIds.length === 0
                              ? 'All Accounts'
                              : filterAccountIds.length === 1
                                ? getAccountDisplayName(filterAccountIds[0])
                                : `${filterAccountIds.length} accounts`}
                            <ChevronDown className="h-3 w-3 ml-2 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-2" align="start">
                          <div className="space-y-1">
                            {accounts.map((account) => {
                              const mask = account.linkedAccounts?.[0]?.mask;
                              const isSelected = filterAccountIds.includes(account.id);
                              return (
                                <div
                                  key={account.id}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer"
                                  onClick={() => toggleAccountFilter(account.id)}
                                >
                                  <Checkbox checked={isSelected} />
                                  <span className="text-sm">
                                    {account.institution}{mask ? ` ****${mask}` : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <div className="flex items-center gap-1">
                        <DatePicker
                          date={startDate}
                          onDateChange={(date) => date && setStartDate(date)}
                          placeholder="Start date"
                          className="w-[130px]"
                        />
                        <span className="text-xs text-muted-foreground">-</span>
                        <DatePicker
                          date={endDate}
                          onDateChange={(date) => date && setEndDate(date)}
                          placeholder="End date"
                          className="w-[130px]"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          placeholder="Min $"
                          value={filterMinAmount}
                          onChange={(e) => setFilterMinAmount(e.target.value)}
                          className="h-8 w-20 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">-</span>
                        <Input
                          type="number"
                          placeholder="Max $"
                          value={filterMaxAmount}
                          onChange={(e) => setFilterMaxAmount(e.target.value)}
                          className="h-8 w-20 text-xs"
                        />
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Search..."
                          value={filterSearch}
                          onChange={(e) => setFilterSearch(e.target.value)}
                          className="h-8 w-32 text-xs pl-7"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={syncTransactions}
                        disabled={syncing || accounts.length === 0}
                        className="h-8 w-8"
                      >
                        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                      </Button>
                      {hasActiveFilters && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={resetFilters}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 flex-1 overflow-hidden min-h-0">
                    <ScrollArea className="h-full">
                      {transactions.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground">
                          No transactions yet. Click &quot;Sync Transactions&quot; to fetch deposits.
                        </div>
                      ) : filteredTransactions.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground">
                          No transactions match filters.
                        </div>
                      ) : (
                        <div className="space-y-1 pr-3">
                          {filteredTransactions.map((txn) => {
                            const tenantTxn = tenantTransactions.find(tt => tt.transactionId === txn.transactionId);
                            const assignedTenant = tenantTxn ? tenants.find(t => t.id === tenantTxn.tenantId) : null;
                            return (
                              <div
                                key={txn.transactionId}
                                draggable={!assignedTenant}
                                onDragStart={(e) => handleDragStart(e, txn)}
                                onDragEnd={handleDragEnd}
                                onClick={() => setSelectedTransaction(txn)}
                                className={`p-3 rounded-md flex items-center justify-between transition-all overflow-hidden cursor-pointer ${
                                  assignedTenant
                                    ? 'opacity-40 bg-muted'
                                    : 'hover:bg-accent active:cursor-grabbing'
                                } ${draggedTransaction?.transactionId === txn.transactionId ? 'opacity-50' : ''}`}
                              >
                                <div className="flex items-center gap-2 min-w-0 w-0 flex-1">
                                  {!assignedTenant && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                  <div className="min-w-0 w-0 flex-1">
                                    <p className="font-medium truncate">{txn.name}</p>
                                    <p className="text-xs text-muted-foreground">{txn.date} · {getAccountDisplayName(txn.itemId)}</p>
                                  </div>
                                </div>
                                <div className="text-right ml-3 shrink-0">
                                  <p className="font-semibold text-success whitespace-nowrap">
                                    ${txn.displayAmount.toLocaleString()}
                                  </p>
                                  {assignedTenant && (
                                    <p className="text-xs text-muted-foreground truncate max-w-[120px]">{assignedTenant.name}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Tenants */}
                <Card className="flex flex-col min-h-0 min-w-0 overflow-hidden p-0">
                  <CardContent className="p-3 flex-1 overflow-hidden min-h-0">
                    <ScrollArea className="h-full">
                      {tenants.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground">
                          No tenants yet. Add tenants in the Tenants tab.
                        </div>
                      ) : (
                        <div className="space-y-1 pr-3">
                          {tenants.map((tenant) => {
                            const tenantTxns = getTransactionsForTenant(tenant.id);
                            const totalAmount = tenantTxns.reduce((sum, t) => sum + t.displayAmount, 0);
                            const isDropTarget = dropTargetTenant === tenant.id;
                            const isCollapsed = collapsedTenants.has(tenant.id);

                            return (
                              <div
                                key={tenant.id}
                                onDragOver={(e) => handleDragOver(e, tenant.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, tenant.id)}
                                className={`rounded-md border transition-all ${
                                  isDropTarget
                                    ? 'bg-primary/10 ring-2 ring-primary ring-inset'
                                    : 'border-border'
                                }`}
                              >
                                {/* Collapsed header - always visible */}
                                <div
                                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-accent/50 transition-colors"
                                  onClick={() => toggleTenantCollapse(tenant.id)}
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                  <div className="flex-1 flex items-center justify-between min-w-0">
                                    <div className="min-w-0 flex-1">
                                      <p className="font-semibold text-sm truncate">{tenant.name}</p>
                                      {isCollapsed && (
                                        <p className="text-xs text-muted-foreground truncate">{tenant.property}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 ml-2 shrink-0">
                                      {tenantTxns.length > 0 && (
                                        <span className="text-sm font-medium text-success">
                                          ${totalAmount.toLocaleString()}
                                        </span>
                                      )}
                                      <span className="text-xs text-muted-foreground">
                                        ${tenant.expectedRent.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded content */}
                                {!isCollapsed && (
                                  <div className="px-3 pb-3">
                                    <p className="text-xs text-muted-foreground mb-2 truncate">{tenant.property}</p>
                                    {tenantTxns.length > 0 ? (
                                      <>
                                        <div className="max-h-[150px] overflow-y-auto overflow-x-hidden space-y-1">
                                          {tenantTxns.map((txn) => (
                                            <div
                                              key={txn.transactionId}
                                              className="p-2 bg-muted rounded flex items-center justify-between overflow-hidden"
                                            >
                                              <div className="min-w-0 w-0 flex-1">
                                                <p className="text-sm truncate">{txn.name}</p>
                                                <p className="text-xs text-muted-foreground">{txn.date}</p>
                                              </div>
                                              <div className="flex items-center gap-2 ml-2 shrink-0">
                                                <p className="text-sm font-medium text-success whitespace-nowrap">
                                                  ${txn.displayAmount.toLocaleString()}
                                                </p>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeTransactionFromTenant(txn.transactionId);
                                                  }}
                                                  className="h-auto py-0.5 px-1.5 text-xs text-destructive hover:text-destructive"
                                                >
                                                  Remove
                                                </Button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        {tenantTxns.length > 1 && (
                                          <div className="pt-2 text-right">
                                            <p className="text-xs text-muted-foreground">
                                              {tenantTxns.length} transactions
                                            </p>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="p-2 border-2 border-dashed rounded text-center">
                                        <p className="text-xs text-muted-foreground">
                                          {draggedTransaction ? 'Drop here to assign' : 'Drag transactions here'}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Transaction Detail Modal */}
              <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Transaction Details</DialogTitle>
                  </DialogHeader>
                  {selectedTransaction && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Description</p>
                        <p className="font-medium break-words">{selectedTransaction.name}</p>
                      </div>
                      {selectedTransaction.merchantName && (
                        <div>
                          <p className="text-sm text-muted-foreground">Merchant</p>
                          <p className="font-medium">{selectedTransaction.merchantName}</p>
                        </div>
                      )}
                      <div className="flex gap-8">
                        <div>
                          <p className="text-sm text-muted-foreground">Amount</p>
                          <p className="font-semibold text-success">${selectedTransaction.displayAmount.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Date</p>
                          <p className="font-medium">{selectedTransaction.date}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Account</p>
                        <p className="font-medium">{getAccountDisplayName(selectedTransaction.itemId)}</p>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Accounts */}
          {activeTab === 'accounts' && (
            <AccountsTab
              accounts={accounts}
              onRefresh={async () => {
                await fetchAccounts();
                await fetchTransactions();
                await fetchAllTransactions();
                await runAutoMatch();
              }}
            />
          )}

          {/* Tenants */}
          {activeTab === 'tenants' && (
            <TenantsTab
              tenants={tenants}
              accounts={accounts}
              allTransactions={allTransactions}
              tenantTransactions={tenantTransactions}
              onUpdate={async () => { await fetchTenants(); await fetchTenantTransactions(); }}
              onTenantAddedOrEdited={runAutoMatch}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function TenantsTab({
  tenants,
  accounts,
  allTransactions,
  tenantTransactions,
  onUpdate,
  onTenantAddedOrEdited,
}: {
  tenants: Tenant[];
  accounts: Account[];
  allTransactions: Transaction[];
  tenantTransactions: TenantTransaction[];
  onUpdate: () => void;
  onTenantAddedOrEdited: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deleteTenantId, setDeleteTenantId] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStartDate, setExportStartDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear() - 1, now.getMonth(), 1);
  });
  const [exportEndDate, setExportEndDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  });
  const [formData, setFormData] = useState({
    name: '',
    property: '',
    expectedRent: '',
    tolerance: '50',
    searchTerms: '',
    accountId: '',
    matchMode: 'searchTerms' as 'searchTerms' | 'exactAmounts',
    exactAmounts: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      property: '',
      expectedRent: '',
      tolerance: '50',
      searchTerms: '',
      accountId: accounts[0]?.id || '',
      matchMode: 'searchTerms',
      exactAmounts: '',
    });
    setEditingTenant(null);
    setShowForm(false);
  };

  const handleEdit = (tenant: Tenant) => {
    setFormData({
      name: tenant.name,
      property: tenant.property,
      expectedRent: tenant.expectedRent.toString(),
      tolerance: tenant.tolerance.toString(),
      searchTerms: tenant.searchTerms.join(', '),
      accountId: tenant.accountId,
      matchMode: tenant.matchMode || 'searchTerms',
      exactAmounts: (tenant.exactAmounts || []).join(', '),
    });
    setEditingTenant(tenant);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Parse exact amounts and auto-set expectedRent to the last amount if in exactAmounts mode
    const exactAmountsArray = formData.exactAmounts
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));

    const expectedRent = formData.matchMode === 'exactAmounts' && exactAmountsArray.length > 0
      ? exactAmountsArray[exactAmountsArray.length - 1] // Use last amount as expected rent
      : parseFloat(formData.expectedRent);

    const tenant = {
      id: editingTenant?.id,
      name: formData.name,
      property: formData.property,
      expectedRent: expectedRent,
      tolerance: formData.matchMode === 'exactAmounts' ? 0 : parseFloat(formData.tolerance),
      searchTerms: formData.matchMode === 'exactAmounts'
        ? []
        : formData.searchTerms.split(',').map((s) => s.trim().toUpperCase()).filter((s) => s !== ''),
      accountId: formData.accountId,
      matchMode: formData.matchMode,
      exactAmounts: exactAmountsArray,
    };

    await fetch('/api/data/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tenant),
    });

    resetForm();
    onUpdate();
    await onTenantAddedOrEdited();
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/data/tenants', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setDeleteTenantId(null);
    onUpdate();
  };

  const getTransactionsForTenant = (tenantId: string): Transaction[] => {
    const tenantTxnIds = tenantTransactions
      .filter(tt => tt.tenantId === tenantId)
      .map(tt => tt.transactionId);
    return allTransactions
      .filter(t => tenantTxnIds.includes(t.transactionId))
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const formatDateForFilter = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const handleExportPDF = async () => {
    const { generateTenantReport } = await import('@/lib/generateTenantReport');

    const startDateStr = formatDateForFilter(exportStartDate);
    const endDateStr = formatDateForFilter(exportEndDate);

    const tenantsWithPayments = tenants.map(tenant => {
      const transactions = getTransactionsForTenant(tenant.id).filter(t =>
        t.date >= startDateStr && t.date <= endDateStr
      );
      const totalPaid = transactions.reduce((sum, t) => sum + t.displayAmount, 0);
      return {
        tenant,
        transactions,
        totalPaid,
      };
    });

    generateTenantReport(tenantsWithPayments, {
      startDate: exportStartDate,
      endDate: exportEndDate,
      reportTitle: 'Tenant Rent Report',
    });

    setShowExportDialog(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex justify-end gap-2 shrink-0 mb-4">
        <Button
          variant="outline"
          onClick={() => setShowExportDialog(true)}
          disabled={tenants.length === 0}
        >
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
        <Button onClick={() => setShowForm(true)}>
          + Add Tenant
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 space-y-6">

      {/* Tenant Form Modal */}
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTenant ? 'Edit Tenant' : 'Add New Tenant'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="John Smith"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="property">Property</Label>
                <Input
                  id="property"
                  value={formData.property}
                  onChange={(e) => setFormData({ ...formData, property: e.target.value })}
                  required
                  placeholder="123 Main St, Unit A"
                />
              </div>

              {/* Match Mode Toggle */}
              <div className="md:col-span-2 space-y-1.5">
                <Label>Match Mode</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.matchMode === 'searchTerms' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, matchMode: 'searchTerms' })}
                  >
                    Search Terms
                  </Button>
                  <Button
                    type="button"
                    variant={formData.matchMode === 'exactAmounts' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, matchMode: 'exactAmounts' })}
                  >
                    Exact Amounts
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formData.matchMode === 'searchTerms'
                    ? 'Match transactions by description text and amount range'
                    : 'Match transactions by exact payment amounts only'}
                </p>
              </div>

              {formData.matchMode === 'searchTerms' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="expectedRent">Expected Rent ($)</Label>
                    <Input
                      id="expectedRent"
                      type="number"
                      value={formData.expectedRent}
                      onChange={(e) => setFormData({ ...formData, expectedRent: e.target.value })}
                      required
                      placeholder="1500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="tolerance">Tolerance ($)</Label>
                    <Input
                      id="tolerance"
                      type="number"
                      value={formData.tolerance}
                      onChange={(e) => setFormData({ ...formData, tolerance: e.target.value })}
                      placeholder="50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Match payments within ±${formData.tolerance || '0'} of expected rent
                    </p>
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="searchTerms">Search Terms</Label>
                    <Input
                      id="searchTerms"
                      value={formData.searchTerms}
                      onChange={(e) => setFormData({ ...formData, searchTerms: e.target.value })}
                      required
                      placeholder="JOHN SMITH, J SMITH, SMITH JOHN"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated names to match in transaction descriptions
                    </p>
                  </div>
                </>
              ) : (
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor="exactAmounts">Exact Amounts ($)</Label>
                  <Input
                    id="exactAmounts"
                    value={formData.exactAmounts}
                    onChange={(e) => setFormData({ ...formData, exactAmounts: e.target.value })}
                    required
                    placeholder="875.00, 900.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated amounts to match exactly (e.g., for rent increases: old amount, new amount)
                  </p>
                </div>
              )}

              {accounts.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="accountId">Account</Label>
                  <select
                    id="accountId"
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">All accounts</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.institution}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit">
                {editingTenant ? 'Save Changes' : 'Add Tenant'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {tenants.length === 0 && !showForm ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              No tenants yet. Click &quot;Add Tenant&quot; to get started.
            </p>
          </CardContent>
        </Card>
      ) : tenants.length > 0 && (
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <Card key={tenant.id} className="py-0 gap-0 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors">
                <div>
                  <p className="font-semibold text-sm">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground">{tenant.property}</p>
                  <p className="text-xs text-muted-foreground">
                    ${tenant.expectedRent.toLocaleString()} ± ${tenant.tolerance}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(tenant)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTenantId(tenant.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      </div>

      {/* Export PDF Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Tenant Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select the date range for the report. Only transactions within this range will be included.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DatePicker
                  date={exportStartDate}
                  onDateChange={(date) => date && setExportStartDate(date)}
                  placeholder="Start date"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <DatePicker
                  date={exportEndDate}
                  onDateChange={(date) => date && setExportEndDate(date)}
                  placeholder="End date"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportPDF}>
              <FileDown className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTenantId}
        onOpenChange={(open) => !open && setDeleteTenantId(null)}
        title="Delete Tenant"
        description="Are you sure you want to delete this tenant? This will also remove all transaction assignments for this tenant."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTenantId && handleDelete(deleteTenantId)}
      />
    </div>
  );
}
