// Dip-buy mean-reversion bot for btc-race-24h-20261117-0603 (agent-fun/bars-replay/v1).
//
// Strategy (validated on the frozen dev window; see README.md):
//   - Flat: buy 100% of cash when the close is a deep dip under a trailing mean —
//     0.7% under the 60-minute SMA, or 0.8% under the 240-minute SMA. The two
//     timescales catch both sharp dips (fast mean) and slow grinds down (slow mean).
//   - Holding: sell the whole position at +1.5% over cost (take profit) or at
//     -0.7% under cost (stop loss), or after 1,440 bars held (the window's length).
//   - No other signal. No randomness, no clock, no network, no files: every
//     decision is a pure function of the bars seen so far, so two runs agree
//     byte for byte.
//
// Validated on the frozen dev window (kit grade-local, --driver process):
// net PnL +$29.50 (+2.95%), 6 fills (3 round trips, the last flattened at the
// close), max drawdown 0.72%, net PnL at 2x fees +$27.04, L1 regrade
// reproduced byte for byte. Guardrails met.
//
// Why this shape: on the dev window the price oscillates in a ~2.5% band with
// six ~1% up-swings. A dip far under a trailing mean reverts far more often
// than it keeps falling (4/4 of the 1%-under-SMA60 dips reverted to +0.5% or
// better within 30 minutes), while a naive "sell at the mean" exit fails — the
// falling mean chases the price down and the exit fires near breakeven. A fixed
// take-profit lets the recovery run. The stop keeps the worst day small: the
// same rule stays profitable on the dev window reversed, rotated, and with
// +/-2% of drift added, and only loses ~0.7% on a -3% drift day.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const FAST_N = 60;
const SLOW_N = 240;
/** Buy when the close is this far under the 60-minute mean (as a fraction). */
const FAST_DIP = 0.007;
/** Buy when the close is this far under the 240-minute mean (as a fraction). */
const SLOW_DIP = 0.008;
/** Take profit: position worth this multiple of its cost (x1000). */
const TP_NUM = 1015n;
/** Stop loss: position worth this multiple of its cost (x1000). */
const SL_NUM = 993n;
/** Longest a position is held, in bars, before it is sold. */
const MAX_HOLD_BARS = 1440;
/** Slippage cap on BUY orders, in bps (1% past the latest close): a buy that
 * would fill more than this above the dip close is rejected, so the bot never
 * chases a dip that already reverted violently. */
const MAX_SLIPPAGE_BPS_BUY = 100;
/** Slippage cap on SELL orders, in bps (5% past the latest close): exits (take
 * profit / stop loss / max hold) must execute even in a fast market — a sell
 * rejected for slippage leaves the position exposed while the market keeps
 * moving, so the exit cap is wide. The fill price is the next open either
 * way; the cap only decides accept/reject. */
const MAX_SLIPPAGE_BPS_SELL = 500;

const closes: number[] = [];
let sumFast = 0;
let sumSlow = 0;
let entryBar = -1;

function push(close: number): void {
  closes.push(close);
  sumFast += close;
  sumSlow += close;
  if (closes.length > FAST_N) sumFast -= closes[closes.length - FAST_N - 1];
  if (closes.length > SLOW_N) sumSlow -= closes[closes.length - SLOW_N - 1];
}

function sma(n: number, sum: number): number | null {
  return closes.length < n ? null : sum / n;
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    push(Number(bar.c));
    if (state.warmingUp) return [];

    const close = closes[closes.length - 1];
    const fast = sma(FAST_N, sumFast);
    const slow = sma(SLOW_N, sumSlow);
    const held = state.positions.get(SYMBOL);

    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      if (value * 1000n >= held.cost * TP_NUM) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS_SELL } satisfies SellInput];
      }
      if (value * 1000n <= held.cost * SL_NUM) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS_SELL } satisfies SellInput];
      }
      if (entryBar >= 0 && state.seq - entryBar >= MAX_HOLD_BARS) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS_SELL } satisfies SellInput];
      }
      return [];
    }

    if (fast === null) return [];
    const dipped = close < fast * (1 - FAST_DIP) || (slow !== null && close < slow * (1 - SLOW_DIP));
    if (!dipped) return [];
    if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryBar = state.seq;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS_BUY } satisfies BuyInput];
  },
});
