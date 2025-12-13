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
import { RefreshCw, Users, GripVertical, X, Sun, Moon, ChevronDown, Check } from 'lucide-react';
import { useTheme } from 'next-themes';
import { AccountsTab } from '@/components/AccountsTab';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

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

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });

  // Transaction filters
  const [filterAccountIds, setFilterAccountIds] = useState<string[]>([]);
  const [filterMinAmount, setFilterMinAmount] = useState<string>('');
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>('');

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
    const res = await fetch(`/api/data/transactions?startDate=${startDate}&endDate=${endDate}&depositsOnly=true`);
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
    return true;
  });

  const unassignedTransactions = filteredTransactions.filter(
    t => !assignedTransactionIds.has(t.transactionId)
  );

  const getTransactionsForTenant = (tenantId: string): Transaction[] => {
    const tenantTxnIds = tenantTransactions
      .filter(tt => tt.tenantId === tenantId)
      .map(tt => tt.transactionId);
    return allTransactions.filter(t => tenantTxnIds.includes(t.transactionId));
  };

  const getAccountDisplayName = (itemId: string): string => {
    const account = accounts.find(a => a.id === itemId);
    if (!account) return '';
    const mask = account.linkedAccounts?.[0]?.mask;
    return `${account.institution}${mask ? ` ****${mask}` : ''}`;
  };

  const hasActiveFilters = filterAccountIds.length > 0 || filterMinAmount !== '' || filterMaxAmount !== '';

  const resetFilters = () => {
    setFilterAccountIds([]);
    setFilterMinAmount('');
    setFilterMaxAmount('');
  };

  const toggleAccountFilter = (accountId: string) => {
    setFilterAccountIds(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
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
                    <CardTitle className="text-base">Deposits</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
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
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="h-8 w-[118px] text-xs px-2"
                        />
                        <span className="text-xs text-muted-foreground">-</span>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="h-8 w-[118px] text-xs px-2"
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
                            const isAssigned = assignedTransactionIds.has(txn.transactionId);
                            return (
                              <div
                                key={txn.transactionId}
                                draggable={!isAssigned}
                                onDragStart={(e) => handleDragStart(e, txn)}
                                onDragEnd={handleDragEnd}
                                className={`p-3 rounded-md flex items-center justify-between transition-all overflow-hidden ${
                                  isAssigned
                                    ? 'opacity-40 bg-muted'
                                    : 'cursor-grab hover:bg-accent active:cursor-grabbing'
                                } ${draggedTransaction?.transactionId === txn.transactionId ? 'opacity-50' : ''}`}
                              >
                                <div className="flex items-center gap-2 min-w-0 w-0 flex-1">
                                  {!isAssigned && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                  <div className="min-w-0 w-0 flex-1">
                                    <p className="font-medium truncate">{txn.name}</p>
                                    <p className="text-xs text-muted-foreground">{txn.date} · {getAccountDisplayName(txn.itemId)}</p>
                                  </div>
                                </div>
                                <div className="text-right ml-3 shrink-0">
                                  <p className="font-semibold text-success whitespace-nowrap">
                                    ${txn.displayAmount.toLocaleString()}
                                  </p>
                                  {isAssigned && (
                                    <p className="text-xs text-muted-foreground">Assigned</p>
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
                <Card className="flex flex-col min-h-0 min-w-0 overflow-hidden">
                  <CardHeader className="pb-3 shrink-0">
                    <CardTitle className="text-base">
                      Tenants
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 flex-1 overflow-hidden min-h-0">
                    <ScrollArea className="h-full">
                      {tenants.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground">
                          No tenants yet. Add tenants in the Tenants tab.
                        </div>
                      ) : (
                        <div className="space-y-2 pr-3">
                          {tenants.map((tenant) => {
                            const tenantTxns = getTransactionsForTenant(tenant.id);
                            const totalAmount = tenantTxns.reduce((sum, t) => sum + t.displayAmount, 0);
                            const isDropTarget = dropTargetTenant === tenant.id;

                            return (
                              <div
                                key={tenant.id}
                                onDragOver={(e) => handleDragOver(e, tenant.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, tenant.id)}
                                className={`p-3 rounded-md border transition-all ${
                                  isDropTarget
                                    ? 'bg-primary/10 ring-2 ring-primary ring-inset'
                                    : 'border-border'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold">{tenant.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{tenant.property}</p>
                                  </div>
                                  <div className="text-right ml-2">
                                    <p className="text-xs text-muted-foreground">Expected</p>
                                    <p className="font-medium">${tenant.expectedRent.toLocaleString()}</p>
                                  </div>
                                </div>

                                <div className="mt-2">
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
                                                onClick={() => removeTransactionFromTenant(txn.transactionId)}
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
                                            {tenantTxns.length} transactions · Total: <span className="font-medium text-success">${totalAmount.toLocaleString()}</span>
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
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
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
  onUpdate,
  onTenantAddedOrEdited,
}: {
  tenants: Tenant[];
  accounts: Account[];
  onUpdate: () => void;
  onTenantAddedOrEdited: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deleteTenantId, setDeleteTenantId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    property: '',
    expectedRent: '',
    tolerance: '50',
    searchTerms: '',
    accountId: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      property: '',
      expectedRent: '',
      tolerance: '50',
      searchTerms: '',
      accountId: accounts[0]?.id || '',
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
    });
    setEditingTenant(tenant);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tenant = {
      id: editingTenant?.id,
      name: formData.name,
      property: formData.property,
      expectedRent: parseFloat(formData.expectedRent),
      tolerance: parseFloat(formData.tolerance),
      searchTerms: formData.searchTerms.split(',').map((s) => s.trim().toUpperCase()),
      accountId: formData.accountId,
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            + Add Tenant
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingTenant ? 'Edit Tenant' : 'Add New Tenant'}</CardTitle>
          </CardHeader>
          <CardContent>
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

              <div className="flex gap-2">
                <Button type="submit">
                  {editingTenant ? 'Save Changes' : 'Add Tenant'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

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
