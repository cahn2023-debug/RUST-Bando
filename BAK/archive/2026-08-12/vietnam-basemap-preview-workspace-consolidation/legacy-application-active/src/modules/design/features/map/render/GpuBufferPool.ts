import type { GpuAllocation } from './overlayTypes';

interface FreeRange {
    byteOffset: number;
    byteLength: number;
}

export class GpuBufferPool {
    private freeRanges: FreeRange[] = [];
    private nextByteOffset = 0;

    constructor(private readonly bufferId: string) {}

    allocate(byteLength: number, vertexCount: number): GpuAllocation {
        const alignedLength = Math.max(0, Math.ceil(byteLength / 4) * 4);
        const reusableIndex = this.freeRanges.findIndex(range => range.byteLength >= alignedLength);
        const byteOffset = reusableIndex >= 0
            ? this.freeRanges.splice(reusableIndex, 1)[0].byteOffset
            : this.nextByteOffset;

        if (reusableIndex < 0) this.nextByteOffset += alignedLength;

        return {
            bufferId: this.bufferId,
            byteOffset,
            byteLength: alignedLength,
            vertexOffset: byteOffset / 4,
            vertexCount,
        };
    }

    free(allocation: GpuAllocation | null | undefined): void {
        if (!allocation) return;
        this.freeRanges.push({ byteOffset: allocation.byteOffset, byteLength: allocation.byteLength });
        this.freeRanges.sort((a, b) => a.byteOffset - b.byteOffset);
    }

    getAllocatedByteLength(): number {
        return this.nextByteOffset;
    }

    getFreeByteLength(): number {
        return this.freeRanges.reduce((sum, range) => sum + range.byteLength, 0);
    }
}

