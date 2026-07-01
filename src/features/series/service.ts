import type { SeriesRepo } from "../../db/repos/series.js";
import { unixNow } from "../../lib/time.js";
import type { SeriesDefaultRoleRecord } from "../../types/index.js";

export class SeriesService {
  constructor(private readonly seriesRepo: SeriesRepo) {}

  listDefaultRoles(seriesId: number): SeriesDefaultRoleRecord[] {
    return this.seriesRepo.listDefaultRoles(seriesId);
  }

  replaceDefaultRoles(seriesId: number, labels: string[]): void {
    this.seriesRepo.replaceDefaultRoles(seriesId, labels, unixNow());
  }
}
