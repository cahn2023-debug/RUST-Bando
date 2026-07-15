/* @ts-self-types="./design_renderer.d.ts" */

import * as wasm from "./design_renderer_bg.wasm";
import { __wbg_set_wasm } from "./design_renderer_bg.js";
__wbg_set_wasm(wasm);

export {
    RendererState
} from "./design_renderer_bg.js";
