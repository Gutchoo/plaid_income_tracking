import { NextRequest, NextResponse } from 'next/server';
import { getRentPayments, getRentPaymentsForMonth, saveRentPayment, type RentPayment } from '@/lib/data';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    const payments = month ? getRentPaymentsForMonth(month) : getRentPayments();
    return NextResponse.json(payments);
  } catch (error) {
    console.error('Error getting payments:', error);
    return NextResponse.json(
      { error: 'Failed to get payments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payment: RentPayment = await request.json();

    // Generate ID if not provided
    if (!payment.id) {
      payment.id = `${payment.tenantId}-${payment.month}`;
    }

    // Mark as manual override if user is manually setting payment status
    payment.manualOverride = true;

    saveRentPayment(payment);
    return NextResponse.json({ success: true, payment });
  } catch (error) {
    console.error('Error saving payment:', error);
    return NextResponse.json(
      { error: 'Failed to save payment' },
      { status: 500 }
    );
  }
}
