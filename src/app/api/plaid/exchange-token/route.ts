import { NextRequest, NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { saveAccount, type Account, type LinkedAccount } from '@/lib/data';

export async function POST(request: NextRequest) {
  try {
    const { publicToken, institutionName, institutionId } = await request.json();

    if (!publicToken) {
      return NextResponse.json(
        { error: 'Missing public token' },
        { status: 400 }
      );
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Fetch the linked accounts
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const linkedAccounts: LinkedAccount[] = accountsResponse.data.accounts.map(acc => ({
      accountId: acc.account_id,
      name: acc.name,
      officialName: acc.official_name || null,
      type: acc.type,
      subtype: acc.subtype || null,
      mask: acc.mask || null,
    }));

    // Save the account with linked accounts info
    const account: Account = {
      id: itemId,
      institution: institutionName || 'Unknown Bank',
      institutionId: institutionId || null,
      accessToken,
      itemId,
      linkedAccounts,
      createdAt: new Date().toISOString(),
    };

    saveAccount(account);

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        institution: account.institution,
        linkedAccounts: account.linkedAccounts,
      },
    });
  } catch (error) {
    console.error('Error exchanging token:', error);
    return NextResponse.json(
      { error: 'Failed to exchange token' },
      { status: 500 }
    );
  }
}
