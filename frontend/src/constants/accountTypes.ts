/**
 * Client-side account-type slugs used by the local account store
 * (`store/accountStore.ts`).
 *
 * There is no name-based classifier here any more: every figure uses the
 * user's own mappings through `investmentAccountTest` in
 * `@/lib/finance/investmentFlows`, and backend account types arrive as
 * `ACCOUNT_TYPE_VALUES` from `@/services/api/accountClassifications`.
 */

export type AccountType = 'credit_card' | 'investment' | 'loan' | 'deposit'
