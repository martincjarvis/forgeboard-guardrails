# React/TS logging samples

This is an **illustrative** corpus for the `logging-review` skill — illustrative source only, **not** built or referenced by any component of this repository (its components mapping stays empty). It is the durable regression set the skill reviews against. None of these files are wired into any buildable project or test gate.

## Running in scratch (throwaway, outside the repo)

Create a throwaway vitest project **outside** the repo, install vitest + typescript, drop in the conformant pair, and run:

```bash
npm init -y
npm install -D vitest typescript
# copy in conformant/orderProcessor.ts and conformant/orderProcessor.test.ts
npx vitest run   # green
```

## Seeing the red

To prove the test has teeth, swap `orderProcessor.ts` for `violating/orderProcessor.ts` (it exports its own `Logger`, so the flat scratch copy resolves without importing across the `conformant/` directory), keep the same test, and re-run `npx vitest run`. The test fails on the positive `toHaveBeenCalledWith("OrderConfirmed", { orderId: "ORD-42" })` assertion (the violating `confirmOrder` emits `info("order confirmed", { email })` — wrong event name + PII), proving the positive assertion has teeth. Generic data only (`jane@example.com` / `ORD-42`).
