const MAX_COLLECTION_LENGTH = 100000000;

export class BincodeDecoder {
    private view: DataView;
    private offset: number = 0;
    private decoder: TextDecoder;

    constructor(data: Uint8Array | ArrayBuffer | number[]) {
        const buffer = data instanceof Uint8Array ? data : new Uint8Array(data as any);
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.decoder = new TextDecoder();
    }

    private checkBounds(bytesNeeded: number) {
        if (this.offset + bytesNeeded > this.view.byteLength) {
            throw new Error(`[BincodeDecoder] Out of bounds: offset ${this.offset}, needs ${bytesNeeded}, total ${this.view.byteLength}. Possible data corruption.`);
        }
    }

    decodeU64(): number {
        this.checkBounds(8);
        const val = this.view.getBigUint64(this.offset, true);
        this.offset += 8;
        return Number(val);
    }

    decodeLength(): number {
        const len = this.decodeU64();
        if (len > MAX_COLLECTION_LENGTH) {
            throw new Error(`[BincodeDecoder] Safe length exceeded: ${len}. Max is ${MAX_COLLECTION_LENGTH}. Data might be corrupted.`);
        }
        return len;
    }

    decodeU32(): number {
        this.checkBounds(4);
        const val = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return val;
    }

    decodeF64(): number {
        this.checkBounds(8);
        const val = this.view.getFloat64(this.offset, true);
        this.offset += 8;
        return val;
    }

    decodeString(): string {
        const len = this.decodeLength();
        this.checkBounds(len);
        const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
        this.offset += len;
        return this.decoder.decode(bytes);
    }

    decodeOption<T>(decoderFunc: () => T): T | null {
        this.checkBounds(1);
        const isSome = this.view.getUint8(this.offset);
        this.offset += 1;
        if (isSome === 1) {
            return decoderFunc();
        }
        return null;
    }

    decodeVec<T>(decoderFunc: () => T): T[] {
        const len = this.decodeLength();
        const result: T[] = new Array(len);
        for (let i = 0; i < len; i++) {
            result[i] = decoderFunc();
        }
        return result;
    }

    decodeObject(): any {
        const jsonStr = this.decodeString();
        try {
            return JSON.parse(jsonStr);
        } catch {
            return {};
        }
    }

    decodeBBox(): any {
        return {
            min_y: this.decodeF64(),
            max_y: this.decodeF64(),
            min_x: this.decodeF64(),
            max_x: this.decodeF64(),
        };
    }

    // --- Domain Specific Decoders ---

    decodeRegion(id: string): any {
        this.decodeString(); // Consume 'id' field in the stream
        return {
            id,
            parent_id: this.decodeOption(() => this.decodeString()),
            name: this.decodeString(),
            description: this.decodeOption(() => this.decodeString()),
        };
    }

    decodeLayer(id: string): any {
        this.decodeString(); // Consume 'id' field in the stream
        return {
            id,
            region_id: this.decodeString(),
            name: this.decodeString(),
            is_visible: (() => {
                this.checkBounds(1);
                return this.view.getUint8(this.offset++) === 1;
            })(),
        };
    }

    decodeFeatureGroup(id: string): any {
        this.decodeString(); // Consume 'id' field in the stream
        return {
            id,
            layer_id: this.decodeString(),
            parent_id: this.decodeOption(() => this.decodeString()),
            name: this.decodeString(),
            type: this.decodeString(),
            group_type: this.decodeString(),
            is_visible: (() => {
                this.checkBounds(1);
                return this.view.getUint8(this.offset++) === 1;
            })(),
            metadata: this.decodeOption(() => this.decodeString()),
        };
    }

    decodeFeature(id: string): any {
        this.decodeString(); // Consume 'id' field in the stream
        return {
            id,
            layer_id: this.decodeString(),
            group_id: this.decodeOption(() => this.decodeString()),
            name: this.decodeString(),
            geom_type: this.decodeString(),
            is_visible: (() => {
                this.checkBounds(1);
                return this.view.getUint8(this.offset++) === 1;
            })(),
            note: this.decodeString(),
            metadata: this.decodeString(),
            bbox: this.decodeOption(() => this.decodeBBox()),
            area: this.decodeOption(() => this.decodeF64()),
            length: this.decodeOption(() => this.decodeF64()),
            coordinates: this.decodeObject(),
            properties: this.decodeObject(),
        };
    }

    async decodeMapStateAsync(): Promise<any> {
        const regionsLen = this.decodeLength();
        console.log(`[Bincode] Decoding ${regionsLen} regions...`);
        const regions: Record<string, any> = {};
        for (let i = 0; i < regionsLen; i++) {
            const id = this.decodeString();
            regions[id] = this.decodeRegion(id);
        }
        console.log(`[Bincode] Regions offset: ${this.offset}`);

        const layersLen = this.decodeLength();
        const layers: Record<string, any> = {};
        for (let i = 0; i < layersLen; i++) {
            const id = this.decodeString();
            layers[id] = this.decodeLayer(id);
        }
        console.log(`[Bincode] Layers offset: ${this.offset}`);

        const groupsLen = this.decodeLength();
        const feature_groups: Record<string, any> = {};
        for (let i = 0; i < groupsLen; i++) {
            const id = this.decodeString();
            feature_groups[id] = this.decodeFeatureGroup(id);
        }
        console.log(`[Bincode] Groups offset: ${this.offset}`);

        const featuresLen = this.decodeLength();
        console.log(`[Bincode] Decoding ${featuresLen} features (chunked)...`);
        const features: Record<string, any> = {};

        const CHUNK_SIZE = 100;
        for (let i = 0; i < featuresLen; i++) {
            const id = this.decodeString();
            features[id] = this.decodeFeature(id);

            if (i > 0 && i % CHUNK_SIZE === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        const settings = this.decodeObject();
        const lastEventId = this.decodeOption(() => this.decodeString());

        return {
            regions,
            layers,
            feature_groups,
            features,
            settings,
            lastEventId
        };
    }

    decodeMapState(): any {
        const regionsLen = this.decodeLength();
        const regions: Record<string, any> = {};
        for (let i = 0; i < regionsLen; i++) {
            const id = this.decodeString();
            regions[id] = this.decodeRegion(id);
        }

        const layersLen = this.decodeLength();
        const layers: Record<string, any> = {};
        for (let i = 0; i < layersLen; i++) {
            const id = this.decodeString();
            layers[id] = this.decodeLayer(id);
        }

        const groupsLen = this.decodeLength();
        const feature_groups: Record<string, any> = {};
        for (let i = 0; i < groupsLen; i++) {
            const id = this.decodeString();
            feature_groups[id] = this.decodeFeatureGroup(id);
        }

        const featuresLen = this.decodeLength();
        const features: Record<string, any> = {};
        for (let i = 0; i < featuresLen; i++) {
            const id = this.decodeString();
            features[id] = this.decodeFeature(id);
        }

        const settings = this.decodeObject();
        const lastEventId = this.decodeOption(() => this.decodeString());

        return {
            regions,
            layers,
            feature_groups,
            features,
            settings,
            lastEventId
        };
    }
}
