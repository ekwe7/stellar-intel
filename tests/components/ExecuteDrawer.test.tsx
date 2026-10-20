import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExecuteDrawer } from '@/components/offramp/ExecuteDrawer';
import * as rateRanking from '@/lib/rate-ranking';
import type { AnchorRate } from '@/types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/stellar/sep10', () => ({
  authenticate: vi.fn(),
}));

vi.mock('@/lib/stellar/sep24', () => ({
  initiateWithdraw: vi.fn(),
  openWithdrawPopup: vi.fn(),
  getWithdrawTransactionRecord: vi.fn(),
}));

vi.mock('@/lib/stellar/sep1', () => ({
  getTransferServer: vi.fn(),
}));

vi.mock('@/lib/stellar/anchors', () => ({
  getAnchorById: vi.fn(),
  getResolvedAnchorById: vi.fn(),
}));

vi.mock('@/lib/stellar/horizon', () => ({
  buildWithdrawPayment: vi.fn(),
  signAndSubmitPayment: vi.fn(),
}));

let mockKycAction: 'complete' | 'cancel' | 'error' = 'complete';

vi.mock('@/components/offramp/KycIframe', () => ({
  KycIframe: ({
    onComplete,
    onCancel,
    onError,
  }: {
    url: string;
    origin: string;
    onComplete: (transactionId: string) => void;
    onCancel: () => void;
    onError: (error: Error) => void;
  }) => {
    if (mockKycAction === 'complete') {
      onComplete('txn-abc-123');
    } else if (mockKycAction === 'cancel') {
      onCancel();
    } else if (mockKycAction === 'error') {
      onError(new Error('User cancelled the transaction'));
    }
    return <div data-testid="kyc-iframe" />;
  },
}));

import * as sep10 from '@/lib/stellar/sep10';
import * as sep24 from '@/lib/stellar/sep24';
import * as anchors from '@/lib/stellar/anchors';
import * as horizon from '@/lib/stellar/horizon';

const mockAuthenticate = vi.mocked(sep10.authenticate);
const mockInitiateWithdraw = vi.mocked(sep24.initiateWithdraw);
const mockGetWithdrawTransactionRecord = vi.mocked(sep24.getWithdrawTransactionRecord);
const mockGetAnchorById = vi.mocked(anchors.getAnchorById);
const mockGetResolvedAnchorById = vi.mocked(anchors.getResolvedAnchorById);
const mockBuildWithdrawPayment = vi.mocked(horizon.buildWithdrawPayment);
const mockSignAndSubmitPayment = vi.mocked(horizon.signAndSubmitPayment);
const mockTrackFunnelEvent = vi.spyOn(rateRanking, 'trackFunnelEvent');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RATE: AnchorRate = {
  anchorId: 'cowrie',
  anchorName: 'Cowrie',
  corridorId: 'usdc-ngn',
  fee: 2,
  feeType: 'flat',
  exchangeRate: 1580,
  totalReceived: 154840,
  source: 'sep24-fee' as const,
  updatedAt: new Date(),
};

const ANCHOR = {
  id: 'cowrie',
  name: 'Cowrie',
  homeDomain: 'cowrie.exchange',
  corridors: ['usdc-ngn'],
  assetCode: 'USDC',
  assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
};

const RESOLVED_ANCHOR = {
  ...ANCHOR,
  TRANSFER_SERVER_SEP0024: 'https://transfer.cowrie.exchange',
  WEB_AUTH_ENDPOINT: 'https://auth.cowrie.exchange',
  SIGNING_KEY: 'G...',
  capabilities: { sep10: true, sep24: true, sep38: false, sep12: false },
};

const PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456789';

const AUTH = {
  jwt: 'test.jwt.token',
  anchorDomain: 'cowrie.exchange',
  publicKey: PUBLIC_KEY,
  expiresAt: new Date(Date.now() + 86400_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockKycAction = 'complete';
  mockGetAnchorById.mockReturnValue(ANCHOR);
  mockGetResolvedAnchorById.mockResolvedValue(RESOLVED_ANCHOR);
  mockAuthenticate.mockResolvedValue(AUTH);
  mockInitiateWithdraw.mockResolvedValue({
    type: 'interactive_customer_info_needed',
    url: 'https://anchor.example/kyc',
    id: 'txn-abc-123',
  });
  mockGetWithdrawTransactionRecord.mockResolvedValue({
    withdrawAnchorAccount: 'GANCHOR123',
    memo: 'TEST_MEMO',
    memoType: 'text',
  });
  mockBuildWithdrawPayment.mockResolvedValue({} as never);
  mockSignAndSubmitPayment.mockResolvedValue({ hash: 'abc123txhash' } as never);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExecuteDrawer', () => {
  it('renders the dialog shell but no anchor name when rate is null', () => {
    render(
      <ExecuteDrawer
        rate={null}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
    // No anchor-specific content should appear
    expect(screen.queryByText('Cowrie')).not.toBeInTheDocument();
    expect(screen.queryByText('100 USDC')).not.toBeInTheDocument();
  });

  it('shows the anchor name and transaction summary when a rate is provided', () => {
    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );
    expect(screen.getByText(/Cowrie/)).toBeInTheDocument();
    expect(screen.getByText('100 USDC')).toBeInTheDocument();
    expect(screen.getByText('Start Off-ramp')).toBeInTheDocument();
  });

  it('runs through the full happy path and shows the tx hash', async () => {
    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Off-ramp'));

    await waitFor(() => expect(screen.getByText('Transaction submitted')).toBeInTheDocument());

    expect(mockAuthenticate).toHaveBeenCalledWith(RESOLVED_ANCHOR, PUBLIC_KEY);
    expect(mockInitiateWithdraw).toHaveBeenCalledWith(RESOLVED_ANCHOR, expect.anything());
    expect(mockBuildWithdrawPayment).toHaveBeenCalled();
    expect(mockSignAndSubmitPayment).toHaveBeenCalled();
    expect(screen.getByText('abc123txhash')).toBeInTheDocument();
  });

  it('shows the error message and a Try Again button when authentication fails', async () => {
    mockAuthenticate.mockRejectedValue(new Error('SEP-10 challenge failed'));

    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Off-ramp'));

    await waitFor(() => expect(screen.getByText('SEP-10 challenge failed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('shows the error when the user cancels the KYC popup', async () => {
    mockKycAction = 'cancel';

    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Off-ramp'));

    await waitFor(() =>
      expect(screen.getByText('User cancelled the transaction')).toBeInTheDocument()
    );
  });

  it('calls onClose when the X button is clicked in idle state', () => {
    const onClose = vi.fn();
    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={onClose}
        onExecuteStarted={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stops with error copy and does not sign when estimate is below the minReceive floor', async () => {
    mockGetWithdrawTransactionRecord.mockResolvedValue({
      withdrawAnchorAccount: 'GANCHOR123',
      memo: 'TEST_MEMO',
      memoType: 'text',
      amountOut: '150000',
    } as never);

    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        minReceive="151743.20"
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Off-ramp'));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Cowrie now estimates you'll receive 150000 NGN, below your minimum of 151743.20 NGN. Nothing has been sent. Choose another anchor or try again later."
        )
      ).toBeInTheDocument()
    );

    expect(mockSignAndSubmitPayment).not.toHaveBeenCalled();
    expect(mockTrackFunnelEvent).toHaveBeenCalledWith('executionFailed', {
      error_class: 'below_min_receive',
    });
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('proceeds to sign and submit payment when estimate meets the minReceive floor', async () => {
    mockGetWithdrawTransactionRecord.mockResolvedValue({
      withdrawAnchorAccount: 'GANCHOR123',
      memo: 'TEST_MEMO',
      memoType: 'text',
      amountOut: '155000',
    } as never);

    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        minReceive="151743.20"
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Off-ramp'));

    await waitFor(() => expect(screen.getByText('Transaction submitted')).toBeInTheDocument());

    expect(mockBuildWithdrawPayment).toHaveBeenCalled();
    expect(mockSignAndSubmitPayment).toHaveBeenCalled();
    expect(screen.queryByText(/below your minimum of/)).not.toBeInTheDocument();
  });

  it('proceeds to sign and displays the note when anchor does not provide an estimate', async () => {
    mockGetWithdrawTransactionRecord.mockResolvedValue({
      withdrawAnchorAccount: 'GANCHOR123',
      memo: 'TEST_MEMO',
      memoType: 'text',
      amountOut: undefined,
    } as never);

    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        minReceive="151743.20"
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Off-ramp'));

    await waitFor(() => expect(screen.getByText('Transaction submitted')).toBeInTheDocument());

    expect(
      screen.getByText(
        "This anchor didn't share an estimate before payment. The final amount is set by the anchor."
      )
    ).toBeInTheDocument();
    expect(mockSignAndSubmitPayment).toHaveBeenCalled();
  });

  it('skips the minReceive check when firmQuote is set', async () => {
    mockGetWithdrawTransactionRecord.mockResolvedValue({
      withdrawAnchorAccount: 'GANCHOR123',
      memo: 'TEST_MEMO',
      memoType: 'text',
      amountOut: '100', // Below floor if checked
    } as never);

    render(
      <ExecuteDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        minReceive="151743.20"
        firmQuote={true}
        onClose={vi.fn()}
        onExecuteStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Off-ramp'));

    await waitFor(() => expect(screen.getByText('Transaction submitted')).toBeInTheDocument());

    expect(mockSignAndSubmitPayment).toHaveBeenCalled();
    expect(screen.queryByText(/below your minimum of/)).not.toBeInTheDocument();
  });
});
