/** Whether the last poll worked, for the page to show. A failed poll leaves the old snapshot in place, which on its
 *  own looks like a calm "updated 12m ago"; this says why. */
export interface Health {
  ok: boolean;
  at: number; // when the last poll finished
  lastOk?: number; // start time of the newest snapshot
  message?: string; // why the last poll failed
  retryAt?: number; // when the next attempt is due
  failures: number; // polls failed in a row
}
