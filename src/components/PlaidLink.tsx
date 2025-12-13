'use client';

import { useCallback, useState, useEffect } from 'react';
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';

interface PlaidLinkProps {
  onSuccess: () => void;
}

export default function PlaidLinkButton({ onSuccess }: PlaidLinkProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        onSuccess();
      } catch (error) {
        console.error('Error exchanging token:', error);
      }
    },
    [onSuccess]
  );

  const onExit = useCallback(() => {
    setLinkToken(null);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit,
  });

  // Automatically open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const getLinkToken = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      });
      const data = await response.json();
      setLinkToken(data.linkToken);
    } catch (error) {
      console.error('Error getting link token:', error);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={getLinkToken}
      disabled={loading}
      className="btn-primary"
    >
      {loading ? 'Loading...' : '+ Add Bank Account'}
    </button>
  );
}
