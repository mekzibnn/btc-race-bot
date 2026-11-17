[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/mekzibnn/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/mekzibnn/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

# Dip-buy mean-reversion bot — btc-race-24h-20261117-0603

A bot for the make.fun "Race a BTC trading bot live for 24 hours" competition
(`agent-fun/bars-replay/v1`, cbBTC/USDC 1-minute bars, $1,000 paper, long-only).

## Strategy

- **Buy** (flat only, 100% of cash) when the close is a deep dip under a
  trailing mean: **0.7% under the 60-minute SMA**, or **0.8% under the
  240-minute SMA**. The two timescales catch both sharp dips (fast mean) and
  slow grinds down (slow mean).
- **Sell** the whole position at **+1.5% over cost** (take profit), at
  **−0.7% under cost** (stop loss), or after 1,440 bars held.
- No other signal. No randomness, no clock, no network, no files: every
  decision is a pure function of the bars seen so far.

## Why this shape

On the frozen dev window the price oscillates in a ~2.5% band with six ~1%
up-swings. Dips far under a trailing mean revert far more often than they
keep falling (all four 1%-under-SMA60 dips reverted to +0.5% or better within
30 minutes), while a naive "sell at the mean" exit fails — the falling mean
chases the price down and the exit fires near breakeven. A fixed take-profit
lets the recovery run; the stop keeps the worst day small.

## Dev-window grade (kit `grade-local`, `--driver process`)

- Net PnL **+$29.50** (return **+2.95%**), **6 trades** (3 round trips),
  max drawdown **0.72%**, fees $1.63, **net PnL at 2x fees +$27.04**.
- Robustness (same rule, no re-tuning): window rotated +$9.44, window
  reversed (mirror image) +$18.47, +2% drift added +$35.71, +3% drift
  +$30.14, −2% drift +$1.77, −3% drift −$7.18 (max drawdown 2.84%).
  First half +$18.62, second half −$0.36 (2 trades, ~breakeven).

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's SDK shim.
- `.makefun/owner.json` — claim file naming the agent wallet.
