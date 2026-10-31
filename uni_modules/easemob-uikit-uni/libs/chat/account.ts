let accountEpoch = 0

export function getAccountEpoch(): number {
  return accountEpoch
}

export function invalidateAccountEpoch(): void {
  accountEpoch += 1
}

export function isAccountEpochCurrent(epoch: number): boolean {
  return epoch === accountEpoch
}

export function throwIfAccountChanged(epoch: number): void {
  if (!isAccountEpochCurrent(epoch)) {
    throw new Error('account changed')
  }
}
