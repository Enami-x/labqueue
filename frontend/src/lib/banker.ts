import { PooledResources } from '../types';

export interface BankerRow {
  id: string;
  state: string;
  allocation: PooledResources;
  need: PooledResources;
}

const fits = (need: PooledResources, avail: PooledResources) =>
  need.gpu <= avail.gpu && need.lic <= avail.lic && need.io <= avail.io;

/**
 * Banker safety algorithm: repeatedly pick a job whose Need fits in Work,
 * let it finish and return its Allocation. Returns that order, or null if
 * some job can never finish (an unsafe state).
 */
export function safetySequence(available: PooledResources, rows: BankerRow[]): string[] | null {
  let work = { ...available };
  const done = new Set<string>();
  const order: string[] = [];
  let progressed = true;
  while (progressed && done.size < rows.length) {
    progressed = false;
    for (const r of rows) {
      if (done.has(r.id) || !fits(r.need, work)) continue;
      work = { gpu: work.gpu + r.allocation.gpu, lic: work.lic + r.allocation.lic, io: work.io + r.allocation.io };
      done.add(r.id);
      order.push(r.id);
      progressed = true;
    }
  }
  return done.size === rows.length ? order : null;
}
