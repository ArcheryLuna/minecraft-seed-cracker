/// <reference types="@webgpu/types" />
// WebGPU version of searchRange. The CPU plans the search (lifting, strategy);
// the GPU does everything per block. Hits are re-verified on the CPU by the
// caller, like worker results. Batches are pipelined (several in flight) and
// sized adaptively.

import { type PreparedObs, searchRange } from "../../cracker";
import { BLOCK, gpuLayout, limitOf, NONE, OBS_U32, PARAM_U32, SOLVER_U32, WORKGROUP } from "./layout";
import { SHADER } from "./shader";

/** Batches in flight at once, so the GPU never waits for a readback. */
const SLOTS = 3;

/** Batch size bounds and target: big enough to fill the GPU, short enough to stay far from browser GPU timeouts. */
const MIN_THREADS = 2 ** 22;

const MAX_THREADS = 2 ** 30;

const START_THREADS = 2 ** 28;

const TARGET_BATCH_SECONDS = 0.06;

/** Hit slots per batch; more hits than this and the batch is redone on the CPU. */
const HIT_CAPACITY = 1 << 16;

export interface GpuInfo {
  vendor: string;
  architecture: string;
}

export interface GpuSearchOptions {
  /** called as batches finish with candidates done so far and the batch's hits */
  onProgress?: (done: number, hits: number[]) => void;
  /** checked between batches; return true to stop early */
  shouldStop?: () => boolean;
}

interface Slot {
  params: GPUBuffer;
  counter: GPUBuffer;
  hits: GPUBuffer;
  read: GPUBuffer;
  bind: GPUBindGroup;
  pending: Promise<void> | null;
}

export class GpuSearcher {
  /** false once the GPU device is lost (driver reset, tab in background too long, ...) */
  alive = true;
  /** threads per batch, adapted to keep batches near TARGET_BATCH_SECONDS; kept between searches */
  private threadsPerBatch = START_THREADS;

  private constructor(
    private device: GPUDevice,
    private pipeline: GPUComputePipeline,
    readonly info: GpuInfo,
  ) {
    device.lost.then(() => {
      this.alive = false;
    });
  }

  /** A searcher on a real (non-software) GPU, or null if WebGPU isn't available. */
  static async create(): Promise<GpuSearcher | null> {
    const gpu = (globalThis.navigator as Navigator | undefined)?.gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const a = adapter.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
    // A software adapter would be slower than the CPU workers.
    if (a?.isFallbackAdapter) return null;
    const device = await adapter.requestDevice();
    const shader = device.createShaderModule({ code: SHADER });
    const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
    return new GpuSearcher(device, pipeline, { vendor: a?.vendor ?? "", architecture: a?.architecture ?? "" });
  }

  destroy() {
    this.device.destroy();
  }

  /**
   * Same result as searchRange over [start, end) (order may differ). Whole
   * 2^24 blocks run on the GPU; partial blocks at the edges run on the CPU.
   */
  async search(
    prepared: PreparedObs[],
    lowBits: number,
    lows: number[],
    start: number,
    end: number,
    maxMisses: number,
    { onProgress, shouldStop }: GpuSearchOptions = {},
  ): Promise<number[]> {
    const layout = gpuLayout(prepared, lowBits, maxMisses);
    const found: number[] = [];
    let done = 0;
    const report = (count: number, hits: number[]) => {
      found.push(...hits);
      done += count;
      onProgress?.(done, hits);
    };
    const cpu = (a: number, b: number) => report(b - a, searchRange(prepared, lowBits, lows, a, b, maxMisses));
    if (!layout) {
      cpu(start, end);
      return found;
    }
    const firstBlock = Math.ceil(start / BLOCK);
    const lastBlock = Math.floor(end / BLOCK); // exclusive
    if (firstBlock >= lastBlock) {
      cpu(start, end);
      return found;
    }
    if (start < firstBlock * BLOCK) cpu(start, firstBlock * BLOCK);
    if (lastBlock * BLOCK < end) cpu(lastBlock * BLOCK, end);

    const d = this.device;
    const U = GPUBufferUsage;
    const obsData = new Uint32Array(prepared.length * OBS_U32);
    prepared.forEach((p, i) =>
      obsData.set(
        [p.n, p.pow2 ? 31 - Math.log2(p.n) : NONE, p.triangular ? 1 : 0, p.offX, p.offZ, p.spanX, p.spanZ, p.cLo, p.cHi, p.droppable ? 1 : 0, limitOf(p), 0],
        i * OBS_U32,
      ),
    );
    const solverData = new Uint32Array(Math.max(1, layout.solvers.length) * SOLVER_U32);
    layout.solvers.forEach((s, i) => solverData.set([s.obs, s.m, s.g, s.inv, s.residues, s.perResidue, s.rerolls, s.offset], i * SOLVER_U32));
    const upload = (data: Uint32Array<ArrayBuffer>) => {
      const buf = d.createBuffer({ size: Math.max(16, data.byteLength), usage: U.STORAGE | U.COPY_DST });
      d.queue.writeBuffer(buf, 0, data);
      return buf;
    };
    const obsBuf = upload(obsData);
    const solverBuf = upload(solverData);
    const lowBuf = upload(new Uint32Array(lows));
    const slots: Slot[] = Array.from({ length: SLOTS }, () => {
      const params = d.createBuffer({ size: PARAM_U32 * 4, usage: U.UNIFORM | U.COPY_DST });
      const counter = d.createBuffer({ size: 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
      const hits = d.createBuffer({ size: HIT_CAPACITY * 8, usage: U.STORAGE | U.COPY_SRC });
      const read = d.createBuffer({ size: 4 + HIT_CAPACITY * 8, usage: U.MAP_READ | U.COPY_DST });
      const bind = d.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [params, obsBuf, solverBuf, lowBuf, counter, hits].map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
      return { params, counter, hits, read, bind, pending: null };
    });

    let failure: unknown = null;
    let lastDone = performance.now();
    try {
      let i = 0;
      for (let b0 = firstBlock; b0 < lastBlock; i++) {
        if (shouldStop?.() || failure) break;
        if (!this.alive) throw new Error("GPU device lost");
        const slot = slots[i % SLOTS];
        if (slot.pending) await slot.pending;
        if (failure) break;

        // One block per workgroup row (y, at most 65535); threads within a block on x, and z if x would overflow.
        const blocksPerBatch = Math.min(65535, Math.max(1, Math.floor(this.threadsPerBatch / layout.perBlock)));
        const nBlocks = Math.min(blocksPerBatch, lastBlock - b0);
        const batchStart = b0;
        b0 += nBlocks;
        const groupsPerBlock = Math.ceil(layout.perBlock / WORKGROUP);
        const zGroups = Math.ceil(groupsPerBlock / 65535);
        const xGroups = Math.ceil(groupsPerBlock / zGroups);
        d.queue.writeBuffer(
          slot.params,
          0,
          new Uint32Array([
            prepared.length, maxMisses, layout.solve ? 1 : 0, lowBits,
            batchStart, nBlocks, layout.perBlock, xGroups,
            HIT_CAPACITY, layout.solvers.length, 0, 0,
            0, 0, 0, 0,
          ]),
        );
        d.queue.writeBuffer(slot.counter, 0, new Uint32Array([0]));
        const enc = d.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, slot.bind);
        pass.dispatchWorkgroups(xGroups, nBlocks, zGroups);
        pass.end();
        enc.copyBufferToBuffer(slot.counter, 0, slot.read, 0, 4);
        enc.copyBufferToBuffer(slot.hits, 0, slot.read, 4, HIT_CAPACITY * 8);
        d.queue.submit([enc.finish()]);

        slot.pending = slot.read
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            const out = new Uint32Array(slot.read.getMappedRange().slice(0));
            slot.read.unmap();
            const count = out[0];
            if (count > HIT_CAPACITY) {
              // Too many hits to hold: redo this batch on the CPU.
              cpu(batchStart * BLOCK, (batchStart + nBlocks) * BLOCK);
            } else {
              const hits: number[] = [];
              for (let h = 0; h < count; h++) hits.push(out[2 + h * 2] * BLOCK + out[1 + h * 2]);
              report(nBlocks * BLOCK, hits);
            }
            // Adapt the batch size: batches finish one after another, so the gap is one batch's GPU time.
            const now = performance.now();
            const secs = (now - lastDone) / 1000;
            lastDone = now;
            if (secs > 0.002 && nBlocks === blocksPerBatch) {
              const factor = Math.min(2, Math.max(0.5, TARGET_BATCH_SECONDS / secs));
              this.threadsPerBatch = Math.min(MAX_THREADS, Math.max(MIN_THREADS, this.threadsPerBatch * factor));
            }
          })
          .catch((err) => {
            failure = err;
          })
          .finally(() => {
            slot.pending = null;
          });
      }
      await Promise.all(slots.map((s) => s.pending));
      if (failure) throw failure;
    } finally {
      await Promise.all(slots.map((s) => s.pending)).catch(() => {});
      for (const s of slots) [s.params, s.counter, s.hits, s.read].forEach((buf) => buf.destroy());
      [obsBuf, solverBuf, lowBuf].forEach((buf) => buf.destroy());
    }
    return found;
  }
}
