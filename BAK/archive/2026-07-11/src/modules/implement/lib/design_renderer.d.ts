/* tslint:disable */
/* eslint-disable */

export class RendererState {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static create(canvas: HTMLCanvasElement, force_webgl: boolean): Promise<RendererState>;
    load_delta_map_data(buffer: Uint8Array): void;
    load_map_data(buffer: Uint8Array): void;
    render(): void;
    resize(new_width: number, new_height: number): void;
}
