import { NextRequest, NextResponse } from 'next/server';
import { getTenants, saveTenant, deleteTenant, removeTenantTransactionsForTenant, removeRejectedMatchesForTenant, type Tenant } from '@/lib/data';

export async function GET() {
  try {
    const tenants = getTenants();
    return NextResponse.json(tenants);
  } catch (error) {
    console.error('Error getting tenants:', error);
    return NextResponse.json(
      { error: 'Failed to get tenants' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant: Tenant = await request.json();

    // Generate ID if not provided
    if (!tenant.id) {
      tenant.id = `tenant-${Date.now()}`;
    }

    saveTenant(tenant);
    return NextResponse.json({ success: true, tenant });
  } catch (error) {
    console.error('Error saving tenant:', error);
    return NextResponse.json(
      { error: 'Failed to save tenant' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    // Remove all transaction assignments for this tenant
    removeTenantTransactionsForTenant(id);

    // Remove all rejected matches for this tenant
    removeRejectedMatchesForTenant(id);

    // Delete the tenant
    deleteTenant(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    return NextResponse.json(
      { error: 'Failed to delete tenant' },
      { status: 500 }
    );
  }
}
