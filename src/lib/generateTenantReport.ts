import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

interface TenantWithPayments {
  tenant: Tenant;
  transactions: Transaction[];
  totalPaid: number;
}

interface ReportOptions {
  startDate?: Date;
  endDate?: Date;
  reportTitle?: string;
}

export function generateTenantReport(
  tenantsWithPayments: TenantWithPayments[],
  options: ReportOptions = {}
): void {
  const { startDate, endDate, reportTitle = 'Tenant Rent Report' } = options;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - 28; // 14px margin on each side

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, pageWidth / 2, 20, { align: 'center' });

  // Date range or generated date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  let dateText = `Generated: ${new Date().toLocaleDateString()}`;
  if (startDate && endDate) {
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    dateText = `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }
  doc.text(dateText, pageWidth / 2, 28, { align: 'center' });

  let yPosition = 45;

  // ============================================
  // SUMMARY SECTION (First)
  // ============================================
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, yPosition);
  yPosition += 10;

  const summaryData = tenantsWithPayments.map(item => [
    item.tenant.name,
    item.tenant.property.length > 45 ? item.tenant.property.substring(0, 42) + '...' : item.tenant.property,
    `$${item.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    item.transactions.length.toString()
  ]);

  // Fixed column widths for summary table
  const summaryColWidths = {
    tenant: 40,
    property: tableWidth - 40 - 35 - 28, // remaining space
    received: 35,
    payments: 28
  };

  autoTable(doc, {
    startY: yPosition,
    head: [['Tenant', 'Property', 'Received', '# Payments']],
    body: summaryData,
    theme: 'striped',
    headStyles: {
      fillColor: [66, 66, 66],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: summaryColWidths.tenant, halign: 'left' },
      1: { cellWidth: summaryColWidths.property, halign: 'left' },
      2: { cellWidth: summaryColWidths.received, halign: 'right' },
      3: { cellWidth: summaryColWidths.payments, halign: 'center' },
    },
    tableWidth: tableWidth,
    margin: { left: 14, right: 14 },
  });

  // Grand totals
  yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const totalReceived = tenantsWithPayments.reduce((sum, item) => sum + item.totalPaid, 0);
  const totalPayments = tenantsWithPayments.reduce((sum, item) => sum + item.transactions.length, 0);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Received: $${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, yPosition);
  yPosition += 6;
  doc.text(`Total Payments: ${totalPayments}`, 14, yPosition);

  // ============================================
  // DETAILED BREAKDOWN BY TENANT (Second)
  // ============================================
  doc.addPage();
  yPosition = 20;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Details by Tenant', 14, yPosition);
  yPosition += 15;

  // Fixed column widths for payment details table
  const detailColWidths = {
    date: 28,
    description: tableWidth - 28 - 32, // remaining space
    amount: 32
  };

  tenantsWithPayments.forEach((item, index) => {
    const { tenant, transactions, totalPaid } = item;

    // Check if we need a new page (leave room for header + at least a few rows)
    if (yPosition > 240) {
      doc.addPage();
      yPosition = 20;
    }

    // Tenant Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(tenant.name, 14, yPosition);
    yPosition += 6;

    // Property
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(tenant.property, 14, yPosition);
    yPosition += 8;

    // Expected Rent Section
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Expected Rent:', 14, yPosition);
    doc.setFont('helvetica', 'normal');

    if (tenant.matchMode === 'exactAmounts' && tenant.exactAmounts.length > 0) {
      // Show all exact amounts
      const amountsText = tenant.exactAmounts
        .map(amt => `$${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join(', ');
      doc.text(amountsText, 50, yPosition);
    } else {
      doc.text(`$${tenant.expectedRent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 50, yPosition);
    }
    yPosition += 10;

    // Payments Table
    if (transactions.length > 0) {
      const tableData = transactions.map(txn => [
        txn.date,
        txn.name.length > 50 ? txn.name.substring(0, 47) + '...' : txn.name,
        `$${txn.displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [['Date', 'Description', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [66, 66, 66],
          fontSize: 9,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: detailColWidths.date, halign: 'left' },
          1: { cellWidth: detailColWidths.description, halign: 'left' },
          2: { cellWidth: detailColWidths.amount, halign: 'right' },
        },
        tableWidth: tableWidth,
        margin: { left: 14, right: 14 },
      });

      // Get the final Y position after the table
      yPosition = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

      // Total Row
      doc.setFont('helvetica', 'bold');
      doc.text('Total Received:', 14, yPosition);
      doc.text(
        `$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        pageWidth - 14,
        yPosition,
        { align: 'right' }
      );
    } else {
      doc.setTextColor(150);
      doc.text('No payments recorded', 14, yPosition);
      doc.setTextColor(0);
    }

    yPosition += 15;

    // Separator line (except for last tenant)
    if (index < tenantsWithPayments.length - 1) {
      doc.setDrawColor(200);
      doc.line(14, yPosition - 5, pageWidth - 14, yPosition - 5);
    }
  });

  // Save the PDF
  const fileName = `tenant-report-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
