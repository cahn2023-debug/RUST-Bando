export class RendererState {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RendererState.prototype);
        obj.__wbg_ptr = ptr;
        RendererStateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RendererStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rendererstate_free(ptr, 0);
    }
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {boolean} force_webgl
     * @returns {Promise<RendererState>}
     */
    static create(canvas, force_webgl) {
        const ret = wasm.rendererstate_create(addHeapObject(canvas), force_webgl);
        return takeObject(ret);
    }
    /**
     * @param {Uint8Array} buffer
     */
    load_delta_map_data(buffer) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.rendererstate_load_delta_map_data(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {Uint8Array} buffer
     */
    load_map_data(buffer) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArray8ToWasm0(buffer, wasm.__wbindgen_export);
            const len0 = WASM_VECTOR_LEN;
            wasm.rendererstate_load_map_data(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    render() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.rendererstate_render(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {number} new_width
     * @param {number} new_height
     */
    resize(new_width, new_height) {
        wasm.rendererstate_resize(this.__wbg_ptr, new_width, new_height);
    }
}
if (Symbol.dispose) RendererState.prototype[Symbol.dispose] = RendererState.prototype.free;
export function __wbg_Window_06e90eea4c7df280(arg0) {
    const ret = getObject(arg0).Window;
    return addHeapObject(ret);
}
export function __wbg_WorkerGlobalScope_defda269b75e179a(arg0) {
    const ret = getObject(arg0).WorkerGlobalScope;
    return addHeapObject(ret);
}
export function __wbg___wbindgen_boolean_get_4a348b369b009243(arg0) {
    const v = getObject(arg0);
    const ret = typeof(v) === 'boolean' ? v : undefined;
    return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
}
export function __wbg___wbindgen_debug_string_43c7ccb034739216(arg0, arg1) {
    const ret = debugString(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_is_function_18bea6e84080c016(arg0) {
    const ret = typeof(getObject(arg0)) === 'function';
    return ret;
}
export function __wbg___wbindgen_is_object_8d3fac158b36498d(arg0) {
    const val = getObject(arg0);
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
}
export function __wbg___wbindgen_is_undefined_4a711ea9d2e1ef93(arg0) {
    const ret = getObject(arg0) === undefined;
    return ret;
}
export function __wbg___wbindgen_number_get_eed4462ef92e1bed(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof(obj) === 'number' ? obj : undefined;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}
export function __wbg___wbindgen_string_get_d09f733449cbf7a2(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_throw_df03e93053e0f4bc(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
}
export function __wbg__wbg_cb_unref_9f02ce912168c354(arg0) {
    getObject(arg0)._wbg_cb_unref();
}
export function __wbg_activeTexture_3be0fe13c0f18d54(arg0, arg1) {
    getObject(arg0).activeTexture(arg1 >>> 0);
}
export function __wbg_activeTexture_7d0260045c495ba6(arg0, arg1) {
    getObject(arg0).activeTexture(arg1 >>> 0);
}
export function __wbg_attachShader_21768322e8a3619a(arg0, arg1, arg2) {
    getObject(arg0).attachShader(getObject(arg1), getObject(arg2));
}
export function __wbg_attachShader_2f3434cd53373da6(arg0, arg1, arg2) {
    getObject(arg0).attachShader(getObject(arg1), getObject(arg2));
}
export function __wbg_beginComputePass_5d05bddfd3eb7ba4(arg0, arg1) {
    const ret = getObject(arg0).beginComputePass(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_beginQuery_dd3ebbe1d3bb59d8(arg0, arg1, arg2) {
    getObject(arg0).beginQuery(arg1 >>> 0, getObject(arg2));
}
export function __wbg_beginRenderPass_9a7bf53d588737dc(arg0, arg1) {
    const ret = getObject(arg0).beginRenderPass(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_bindAttribLocation_5164f9e4596f027c(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).bindAttribLocation(getObject(arg1), arg2 >>> 0, getStringFromWasm0(arg3, arg4));
}
export function __wbg_bindAttribLocation_af5a225e74fb6141(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).bindAttribLocation(getObject(arg1), arg2 >>> 0, getStringFromWasm0(arg3, arg4));
}
export function __wbg_bindBufferRange_0316d2cba49bce9d(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).bindBufferRange(arg1 >>> 0, arg2 >>> 0, getObject(arg3), arg4, arg5);
}
export function __wbg_bindBuffer_61958816c937ffff(arg0, arg1, arg2) {
    getObject(arg0).bindBuffer(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindBuffer_e78996aab480a1f6(arg0, arg1, arg2) {
    getObject(arg0).bindBuffer(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindFramebuffer_5156b16c7ae2338c(arg0, arg1, arg2) {
    getObject(arg0).bindFramebuffer(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindFramebuffer_fd476de217885aae(arg0, arg1, arg2) {
    getObject(arg0).bindFramebuffer(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindRenderbuffer_bb8b1475d67f0451(arg0, arg1, arg2) {
    getObject(arg0).bindRenderbuffer(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindRenderbuffer_dc191da8b1226815(arg0, arg1, arg2) {
    getObject(arg0).bindRenderbuffer(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindSampler_e008e511f4f3083f(arg0, arg1, arg2) {
    getObject(arg0).bindSampler(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindTexture_5b3c988c941c976c(arg0, arg1, arg2) {
    getObject(arg0).bindTexture(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindTexture_618807e60f862940(arg0, arg1, arg2) {
    getObject(arg0).bindTexture(arg1 >>> 0, getObject(arg2));
}
export function __wbg_bindVertexArrayOES_153fa17ba261436a(arg0, arg1) {
    getObject(arg0).bindVertexArrayOES(getObject(arg1));
}
export function __wbg_bindVertexArray_d808f22d0aad011d(arg0, arg1) {
    getObject(arg0).bindVertexArray(getObject(arg1));
}
export function __wbg_blendColor_54d98d9b2f864b4d(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).blendColor(arg1, arg2, arg3, arg4);
}
export function __wbg_blendColor_a03c1bd3f28b93b8(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).blendColor(arg1, arg2, arg3, arg4);
}
export function __wbg_blendEquationSeparate_0a680f9cafda4025(arg0, arg1, arg2) {
    getObject(arg0).blendEquationSeparate(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_blendEquationSeparate_332eb02e2f68590a(arg0, arg1, arg2) {
    getObject(arg0).blendEquationSeparate(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_blendEquation_0f77b7cccd2cc50a(arg0, arg1) {
    getObject(arg0).blendEquation(arg1 >>> 0);
}
export function __wbg_blendEquation_3676772d06f57db7(arg0, arg1) {
    getObject(arg0).blendEquation(arg1 >>> 0);
}
export function __wbg_blendFuncSeparate_7785c62127bf201c(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).blendFuncSeparate(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_blendFuncSeparate_fdbc79ffca14ec40(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).blendFuncSeparate(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_blendFunc_1f1d9cbfccd44577(arg0, arg1, arg2) {
    getObject(arg0).blendFunc(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_blendFunc_930aaa1b9092bead(arg0, arg1, arg2) {
    getObject(arg0).blendFunc(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_blitFramebuffer_233062fdbe25cba8(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) {
    getObject(arg0).blitFramebuffer(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, arg10 >>> 0);
}
export function __wbg_bufferData_0dc43e57e06e990c(arg0, arg1, arg2, arg3) {
    getObject(arg0).bufferData(arg1 >>> 0, arg2, arg3 >>> 0);
}
export function __wbg_bufferData_ab903e269c28d449(arg0, arg1, arg2, arg3) {
    getObject(arg0).bufferData(arg1 >>> 0, arg2, arg3 >>> 0);
}
export function __wbg_bufferData_f5a5648b3547d524(arg0, arg1, arg2, arg3) {
    getObject(arg0).bufferData(arg1 >>> 0, getObject(arg2), arg3 >>> 0);
}
export function __wbg_bufferData_fb2bac4eee50a43b(arg0, arg1, arg2, arg3) {
    getObject(arg0).bufferData(arg1 >>> 0, getObject(arg2), arg3 >>> 0);
}
export function __wbg_bufferSubData_5a00c8fa21be2901(arg0, arg1, arg2, arg3) {
    getObject(arg0).bufferSubData(arg1 >>> 0, arg2, getObject(arg3));
}
export function __wbg_bufferSubData_9026e43186acb987(arg0, arg1, arg2, arg3) {
    getObject(arg0).bufferSubData(arg1 >>> 0, arg2, getObject(arg3));
}
export function __wbg_buffer_d8bcb2548b84f613(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
}
export function __wbg_call_85e5437fa1ab109d() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
}, arguments); }
export function __wbg_clearBuffer_b08b15b7ee3c9d57(arg0, arg1, arg2) {
    getObject(arg0).clearBuffer(getObject(arg1), arg2);
}
export function __wbg_clearBuffer_f24f8de43db597ec(arg0, arg1, arg2, arg3) {
    getObject(arg0).clearBuffer(getObject(arg1), arg2, arg3);
}
export function __wbg_clearBufferfv_413dad56265cea30(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).clearBufferfv(arg1 >>> 0, arg2, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_clearBufferiv_1c95657907bb4770(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).clearBufferiv(arg1 >>> 0, arg2, getArrayI32FromWasm0(arg3, arg4));
}
export function __wbg_clearBufferuiv_262391300da42943(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).clearBufferuiv(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4));
}
export function __wbg_clearDepth_a8523c44be7eb524(arg0, arg1) {
    getObject(arg0).clearDepth(arg1);
}
export function __wbg_clearDepth_ab283bc942ad05b7(arg0, arg1) {
    getObject(arg0).clearDepth(arg1);
}
export function __wbg_clearStencil_4c40e2ee7e70cadb(arg0, arg1) {
    getObject(arg0).clearStencil(arg1);
}
export function __wbg_clearStencil_f76d221859e13c2e(arg0, arg1) {
    getObject(arg0).clearStencil(arg1);
}
export function __wbg_clear_52adcd779ed92dfe(arg0, arg1) {
    getObject(arg0).clear(arg1 >>> 0);
}
export function __wbg_clear_5ba1abb31b0c4492(arg0, arg1) {
    getObject(arg0).clear(arg1 >>> 0);
}
export function __wbg_clientWaitSync_3f5c9ffd667ef128(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).clientWaitSync(getObject(arg1), arg2 >>> 0, arg3 >>> 0);
    return ret;
}
export function __wbg_colorMask_56724ac24197d1aa(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).colorMask(arg1 !== 0, arg2 !== 0, arg3 !== 0, arg4 !== 0);
}
export function __wbg_colorMask_9ec26081d0bc18d2(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).colorMask(arg1 !== 0, arg2 !== 0, arg3 !== 0, arg4 !== 0);
}
export function __wbg_compileShader_236d9032e394839c(arg0, arg1) {
    getObject(arg0).compileShader(getObject(arg1));
}
export function __wbg_compileShader_e23d6867384c1c02(arg0, arg1) {
    getObject(arg0).compileShader(getObject(arg1));
}
export function __wbg_compressedTexSubImage2D_a1cd45cd92094475(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    getObject(arg0).compressedTexSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, getObject(arg8));
}
export function __wbg_compressedTexSubImage2D_a39dd3c747eb70c0(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).compressedTexSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8, arg9);
}
export function __wbg_compressedTexSubImage2D_aed3cbf087f725c6(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    getObject(arg0).compressedTexSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, getObject(arg8));
}
export function __wbg_compressedTexSubImage3D_1008f2c595cf5db8(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
    getObject(arg0).compressedTexSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, arg10, arg11);
}
export function __wbg_compressedTexSubImage3D_23a003621dcbca74(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) {
    getObject(arg0).compressedTexSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, getObject(arg10));
}
export function __wbg_configure_6e1ccd3ac31b721c(arg0, arg1) {
    getObject(arg0).configure(getObject(arg1));
}
export function __wbg_copyBufferSubData_66e443f563f3b885(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).copyBufferSubData(arg1 >>> 0, arg2 >>> 0, arg3, arg4, arg5);
}
export function __wbg_copyBufferToBuffer_d52339f5d639af9b(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).copyBufferToBuffer(getObject(arg1), arg2, getObject(arg3), arg4, arg5);
}
export function __wbg_copyBufferToTexture_48aa78a412b2a467(arg0, arg1, arg2, arg3) {
    getObject(arg0).copyBufferToTexture(getObject(arg1), getObject(arg2), getObject(arg3));
}
export function __wbg_copyExternalImageToTexture_eebbba3aa85a0b95(arg0, arg1, arg2, arg3) {
    getObject(arg0).copyExternalImageToTexture(getObject(arg1), getObject(arg2), getObject(arg3));
}
export function __wbg_copyTexSubImage2D_11e990c2a2309075(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    getObject(arg0).copyTexSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8);
}
export function __wbg_copyTexSubImage2D_d6017cd8c1cad208(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
    getObject(arg0).copyTexSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8);
}
export function __wbg_copyTexSubImage3D_e221c5c3f24fb351(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).copyTexSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9);
}
export function __wbg_copyTextureToBuffer_5aef45a98e34a97e(arg0, arg1, arg2, arg3) {
    getObject(arg0).copyTextureToBuffer(getObject(arg1), getObject(arg2), getObject(arg3));
}
export function __wbg_copyTextureToTexture_97d0e9333a1e1008(arg0, arg1, arg2, arg3) {
    getObject(arg0).copyTextureToTexture(getObject(arg1), getObject(arg2), getObject(arg3));
}
export function __wbg_createBindGroupLayout_e37f9323c278f93f(arg0, arg1) {
    const ret = getObject(arg0).createBindGroupLayout(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createBindGroup_876adbf7e329ce2e(arg0, arg1) {
    const ret = getObject(arg0).createBindGroup(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createBuffer_47daa953240daa4c(arg0) {
    const ret = getObject(arg0).createBuffer();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createBuffer_9c121e15c9e00c5d(arg0) {
    const ret = getObject(arg0).createBuffer();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createBuffer_e3f8b2bd8b492498(arg0, arg1) {
    const ret = getObject(arg0).createBuffer(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createCommandEncoder_e617922978f8b4de(arg0, arg1) {
    const ret = getObject(arg0).createCommandEncoder(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createComputePipeline_6794bf24c6c03583(arg0, arg1) {
    const ret = getObject(arg0).createComputePipeline(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createFramebuffer_290ad0b2b5ae3454(arg0) {
    const ret = getObject(arg0).createFramebuffer();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createFramebuffer_524c5c1250ddc8f1(arg0) {
    const ret = getObject(arg0).createFramebuffer();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createPipelineLayout_1a8ea1f550cfa5e7(arg0, arg1) {
    const ret = getObject(arg0).createPipelineLayout(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createProgram_846361296f69750c(arg0) {
    const ret = getObject(arg0).createProgram();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createProgram_ad9af32f8201a79e(arg0) {
    const ret = getObject(arg0).createProgram();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createQuerySet_6050df2adcb1f167(arg0, arg1) {
    const ret = getObject(arg0).createQuerySet(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createQuery_98b52595f5a29a3c(arg0) {
    const ret = getObject(arg0).createQuery();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createRenderBundleEncoder_a98ecb1771e99ab3(arg0, arg1) {
    const ret = getObject(arg0).createRenderBundleEncoder(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createRenderPipeline_921034ccba195ffe(arg0, arg1) {
    const ret = getObject(arg0).createRenderPipeline(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createRenderbuffer_64af86ed6cd9ed67(arg0) {
    const ret = getObject(arg0).createRenderbuffer();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createRenderbuffer_e63fee49f091de10(arg0) {
    const ret = getObject(arg0).createRenderbuffer();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createSampler_cb4137c4e97c7098(arg0, arg1) {
    const ret = getObject(arg0).createSampler(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createSampler_dc4d7414d1a7b2bb(arg0) {
    const ret = getObject(arg0).createSampler();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createShaderModule_912a19a8ccc2aa1a(arg0, arg1) {
    const ret = getObject(arg0).createShaderModule(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createShader_c5819f2eba192d4a(arg0, arg1) {
    const ret = getObject(arg0).createShader(arg1 >>> 0);
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createShader_e3bd44f6e5b9fb54(arg0, arg1) {
    const ret = getObject(arg0).createShader(arg1 >>> 0);
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createTexture_1a3ebeb1ddd7a035(arg0, arg1) {
    const ret = getObject(arg0).createTexture(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_createTexture_c49dc70e209bbf74(arg0) {
    const ret = getObject(arg0).createTexture();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createTexture_e98bcb05f8fd45d0(arg0) {
    const ret = getObject(arg0).createTexture();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createVertexArrayOES_b07f8dcb529e7e7e(arg0) {
    const ret = getObject(arg0).createVertexArrayOES();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createVertexArray_00c041343cb8cbc0(arg0) {
    const ret = getObject(arg0).createVertexArray();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_createView_c227b9af7bd5f441(arg0, arg1) {
    const ret = getObject(arg0).createView(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_cullFace_051b6ff10a7ff902(arg0, arg1) {
    getObject(arg0).cullFace(arg1 >>> 0);
}
export function __wbg_cullFace_b64d9565f7626719(arg0, arg1) {
    getObject(arg0).cullFace(arg1 >>> 0);
}
export function __wbg_deleteBuffer_060051fd2a0b1b4c(arg0, arg1) {
    getObject(arg0).deleteBuffer(getObject(arg1));
}
export function __wbg_deleteBuffer_a0ea769e9ec83c27(arg0, arg1) {
    getObject(arg0).deleteBuffer(getObject(arg1));
}
export function __wbg_deleteFramebuffer_f4b01b04045a5736(arg0, arg1) {
    getObject(arg0).deleteFramebuffer(getObject(arg1));
}
export function __wbg_deleteFramebuffer_f768dc1001c7c5e3(arg0, arg1) {
    getObject(arg0).deleteFramebuffer(getObject(arg1));
}
export function __wbg_deleteProgram_3aacc531475839fc(arg0, arg1) {
    getObject(arg0).deleteProgram(getObject(arg1));
}
export function __wbg_deleteProgram_7e3d5316b8cc61c6(arg0, arg1) {
    getObject(arg0).deleteProgram(getObject(arg1));
}
export function __wbg_deleteQuery_eb68f4fced7ca1f4(arg0, arg1) {
    getObject(arg0).deleteQuery(getObject(arg1));
}
export function __wbg_deleteRenderbuffer_7938ed8648b8c92c(arg0, arg1) {
    getObject(arg0).deleteRenderbuffer(getObject(arg1));
}
export function __wbg_deleteRenderbuffer_87cd46a0e1302450(arg0, arg1) {
    getObject(arg0).deleteRenderbuffer(getObject(arg1));
}
export function __wbg_deleteSampler_a30402525036df37(arg0, arg1) {
    getObject(arg0).deleteSampler(getObject(arg1));
}
export function __wbg_deleteShader_1511484c42d947ba(arg0, arg1) {
    getObject(arg0).deleteShader(getObject(arg1));
}
export function __wbg_deleteShader_94814fd47a6ebf7f(arg0, arg1) {
    getObject(arg0).deleteShader(getObject(arg1));
}
export function __wbg_deleteSync_b2aa5033a9b00e55(arg0, arg1) {
    getObject(arg0).deleteSync(getObject(arg1));
}
export function __wbg_deleteTexture_2a0f89910b267b29(arg0, arg1) {
    getObject(arg0).deleteTexture(getObject(arg1));
}
export function __wbg_deleteTexture_d4d044c852ecc863(arg0, arg1) {
    getObject(arg0).deleteTexture(getObject(arg1));
}
export function __wbg_deleteVertexArrayOES_d5a3ba65881665c6(arg0, arg1) {
    getObject(arg0).deleteVertexArrayOES(getObject(arg1));
}
export function __wbg_deleteVertexArray_48a16d5db470fa74(arg0, arg1) {
    getObject(arg0).deleteVertexArray(getObject(arg1));
}
export function __wbg_depthFunc_53a8ccfcf719b35b(arg0, arg1) {
    getObject(arg0).depthFunc(arg1 >>> 0);
}
export function __wbg_depthFunc_7c6a1b8ed87ab487(arg0, arg1) {
    getObject(arg0).depthFunc(arg1 >>> 0);
}
export function __wbg_depthMask_52a61b10c73c1e60(arg0, arg1) {
    getObject(arg0).depthMask(arg1 !== 0);
}
export function __wbg_depthMask_a241b99385436210(arg0, arg1) {
    getObject(arg0).depthMask(arg1 !== 0);
}
export function __wbg_depthRange_0e48b7b211fe9822(arg0, arg1, arg2) {
    getObject(arg0).depthRange(arg1, arg2);
}
export function __wbg_depthRange_79815d62869f72fe(arg0, arg1, arg2) {
    getObject(arg0).depthRange(arg1, arg2);
}
export function __wbg_destroy_50767c0458f7c8d1(arg0) {
    getObject(arg0).destroy();
}
export function __wbg_destroy_80182ff6e496228e(arg0) {
    getObject(arg0).destroy();
}
export function __wbg_destroy_a2c0702c5d1269b5(arg0) {
    getObject(arg0).destroy();
}
export function __wbg_disableVertexAttribArray_8d9662655cd83eb3(arg0, arg1) {
    getObject(arg0).disableVertexAttribArray(arg1 >>> 0);
}
export function __wbg_disableVertexAttribArray_d0b9791f6094cbb6(arg0, arg1) {
    getObject(arg0).disableVertexAttribArray(arg1 >>> 0);
}
export function __wbg_disable_6b4fee8b91a573af(arg0, arg1) {
    getObject(arg0).disable(arg1 >>> 0);
}
export function __wbg_disable_ca1529aa94bdcdfb(arg0, arg1) {
    getObject(arg0).disable(arg1 >>> 0);
}
export function __wbg_dispatchWorkgroupsIndirect_64be0198a6df9be7(arg0, arg1, arg2) {
    getObject(arg0).dispatchWorkgroupsIndirect(getObject(arg1), arg2);
}
export function __wbg_dispatchWorkgroups_c122d0482fa3f389(arg0, arg1, arg2, arg3) {
    getObject(arg0).dispatchWorkgroups(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0);
}
export function __wbg_document_6359a1a8cf0c0ccc(arg0) {
    const ret = getObject(arg0).document;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_drawArraysInstancedANGLE_e96b816a0ef0fe12(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).drawArraysInstancedANGLE(arg1 >>> 0, arg2, arg3, arg4);
}
export function __wbg_drawArraysInstanced_942797a873f4008e(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).drawArraysInstanced(arg1 >>> 0, arg2, arg3, arg4);
}
export function __wbg_drawArrays_b083203ff35055f1(arg0, arg1, arg2, arg3) {
    getObject(arg0).drawArrays(arg1 >>> 0, arg2, arg3);
}
export function __wbg_drawArrays_f0a24e44f85e66c9(arg0, arg1, arg2, arg3) {
    getObject(arg0).drawArrays(arg1 >>> 0, arg2, arg3);
}
export function __wbg_drawBuffersWEBGL_19eed1eb59d05d95(arg0, arg1) {
    getObject(arg0).drawBuffersWEBGL(getObject(arg1));
}
export function __wbg_drawBuffers_6eace6df1ad4e316(arg0, arg1) {
    getObject(arg0).drawBuffers(getObject(arg1));
}
export function __wbg_drawElementsInstancedANGLE_f02fa224a8594b34(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).drawElementsInstancedANGLE(arg1 >>> 0, arg2, arg3 >>> 0, arg4, arg5);
}
export function __wbg_drawElementsInstanced_a6beff983591ba55(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).drawElementsInstanced(arg1 >>> 0, arg2, arg3 >>> 0, arg4, arg5);
}
export function __wbg_drawIndexedIndirect_888ac46c4c23516f(arg0, arg1, arg2) {
    getObject(arg0).drawIndexedIndirect(getObject(arg1), arg2);
}
export function __wbg_drawIndexedIndirect_fcc6ecbd3d698094(arg0, arg1, arg2) {
    getObject(arg0).drawIndexedIndirect(getObject(arg1), arg2);
}
export function __wbg_drawIndexed_55f6bf3bda0212ad(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
}
export function __wbg_drawIndexed_9c9719597507e735(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
}
export function __wbg_drawIndirect_73df189881970a43(arg0, arg1, arg2) {
    getObject(arg0).drawIndirect(getObject(arg1), arg2);
}
export function __wbg_drawIndirect_a2f7c719957f8ec9(arg0, arg1, arg2) {
    getObject(arg0).drawIndirect(getObject(arg1), arg2);
}
export function __wbg_draw_57caf8f0bc1ea050(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_draw_ce5e8b8ad56571cb(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_enableVertexAttribArray_b0caaace26bfa295(arg0, arg1) {
    getObject(arg0).enableVertexAttribArray(arg1 >>> 0);
}
export function __wbg_enableVertexAttribArray_f0f98a4040fdbc48(arg0, arg1) {
    getObject(arg0).enableVertexAttribArray(arg1 >>> 0);
}
export function __wbg_enable_502662539a40a28a(arg0, arg1) {
    getObject(arg0).enable(arg1 >>> 0);
}
export function __wbg_enable_bf4237ff1ff8c828(arg0, arg1) {
    getObject(arg0).enable(arg1 >>> 0);
}
export function __wbg_endQuery_331e18299a79c7a5(arg0, arg1) {
    getObject(arg0).endQuery(arg1 >>> 0);
}
export function __wbg_end_54134488dbc5b7a9(arg0) {
    getObject(arg0).end();
}
export function __wbg_end_57a2746c247f499a(arg0) {
    getObject(arg0).end();
}
export function __wbg_error_2acb88afe0ad9a3e(arg0) {
    const ret = getObject(arg0).error;
    return addHeapObject(ret);
}
export function __wbg_error_a6fa202b58aa1cd3(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        console.error(getStringFromWasm0(arg0, arg1));
    } finally {
        wasm.__wbindgen_export4(deferred0_0, deferred0_1, 1);
    }
}
export function __wbg_executeBundles_2905636f81aabf99(arg0, arg1) {
    getObject(arg0).executeBundles(getObject(arg1));
}
export function __wbg_features_30a76d141781ad80(arg0) {
    const ret = getObject(arg0).features;
    return addHeapObject(ret);
}
export function __wbg_features_fdbd3daed26aa468(arg0) {
    const ret = getObject(arg0).features;
    return addHeapObject(ret);
}
export function __wbg_fenceSync_8ad74c905bd7a726(arg0, arg1, arg2) {
    const ret = getObject(arg0).fenceSync(arg1 >>> 0, arg2 >>> 0);
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_finish_35be15c58b55a95b(arg0, arg1) {
    const ret = getObject(arg0).finish(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_finish_41491ca602373cde(arg0) {
    const ret = getObject(arg0).finish();
    return addHeapObject(ret);
}
export function __wbg_finish_eb06372cc93f8d50(arg0, arg1) {
    const ret = getObject(arg0).finish(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_finish_ee515f526784acd5(arg0) {
    const ret = getObject(arg0).finish();
    return addHeapObject(ret);
}
export function __wbg_framebufferRenderbuffer_1d6d71ac718ce312(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).framebufferRenderbuffer(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, getObject(arg4));
}
export function __wbg_framebufferRenderbuffer_e19adc8060db2739(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).framebufferRenderbuffer(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, getObject(arg4));
}
export function __wbg_framebufferTexture2D_7d79e3e8404de961(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).framebufferTexture2D(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, getObject(arg4), arg5);
}
export function __wbg_framebufferTexture2D_91c5e075609fceb8(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).framebufferTexture2D(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, getObject(arg4), arg5);
}
export function __wbg_framebufferTextureLayer_ba0f9bb63a03aa1e(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).framebufferTextureLayer(arg1 >>> 0, arg2 >>> 0, getObject(arg3), arg4, arg5);
}
export function __wbg_framebufferTextureMultiviewOVR_617003fcdee9f1f8(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).framebufferTextureMultiviewOVR(arg1 >>> 0, arg2 >>> 0, getObject(arg3), arg4, arg5, arg6);
}
export function __wbg_frontFace_1c3a91897ba0c05c(arg0, arg1) {
    getObject(arg0).frontFace(arg1 >>> 0);
}
export function __wbg_frontFace_c764add9f544070d(arg0, arg1) {
    getObject(arg0).frontFace(arg1 >>> 0);
}
export function __wbg_getBindGroupLayout_aba26df848b4322d(arg0, arg1) {
    const ret = getObject(arg0).getBindGroupLayout(arg1 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getBindGroupLayout_b9533489f3ee14df(arg0, arg1) {
    const ret = getObject(arg0).getBindGroupLayout(arg1 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getBufferSubData_85857856aea9ddf7(arg0, arg1, arg2, arg3) {
    getObject(arg0).getBufferSubData(arg1 >>> 0, arg2, getObject(arg3));
}
export function __wbg_getCompilationInfo_b41435ddc0bb40c8(arg0) {
    const ret = getObject(arg0).getCompilationInfo();
    return addHeapObject(ret);
}
export function __wbg_getContext_04284fba8d5ddd43() { return handleError(function (arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2), getObject(arg3));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}, arguments); }
export function __wbg_getContext_3be9714e8c10edf9() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}, arguments); }
export function __wbg_getContext_7461fad4f1403bbb() { return handleError(function (arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2), getObject(arg3));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}, arguments); }
export function __wbg_getContext_f72782afa2405e15() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}, arguments); }
export function __wbg_getCurrentTexture_6dc2cdde9bdc098d(arg0) {
    const ret = getObject(arg0).getCurrentTexture();
    return addHeapObject(ret);
}
export function __wbg_getExtension_856c47ff51f35217() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).getExtension(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}, arguments); }
export function __wbg_getIndexedParameter_d8732c93c7a5b4c8() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).getIndexedParameter(arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
}, arguments); }
export function __wbg_getMappedRange_11ec4cfce4df1e72(arg0, arg1, arg2) {
    const ret = getObject(arg0).getMappedRange(arg1, arg2);
    return addHeapObject(ret);
}
export function __wbg_getParameter_5411a293dec41316() { return handleError(function (arg0, arg1) {
    const ret = getObject(arg0).getParameter(arg1 >>> 0);
    return addHeapObject(ret);
}, arguments); }
export function __wbg_getParameter_5557cdf216b7848e() { return handleError(function (arg0, arg1) {
    const ret = getObject(arg0).getParameter(arg1 >>> 0);
    return addHeapObject(ret);
}, arguments); }
export function __wbg_getPreferredCanvasFormat_4314f4e4f5895771(arg0) {
    const ret = getObject(arg0).getPreferredCanvasFormat();
    return (__wbindgen_enum_GpuTextureFormat.indexOf(ret) + 1 || 96) - 1;
}
export function __wbg_getProgramInfoLog_12c0e1b320c19323(arg0, arg1, arg2) {
    const ret = getObject(arg1).getProgramInfoLog(getObject(arg2));
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_getProgramInfoLog_81115d19ca500400(arg0, arg1, arg2) {
    const ret = getObject(arg1).getProgramInfoLog(getObject(arg2));
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_getProgramParameter_10ff9679fb033dae(arg0, arg1, arg2) {
    const ret = getObject(arg0).getProgramParameter(getObject(arg1), arg2 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getProgramParameter_bd1bd68723ca3e45(arg0, arg1, arg2) {
    const ret = getObject(arg0).getProgramParameter(getObject(arg1), arg2 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getQueryParameter_6a712eacc69b0503(arg0, arg1, arg2) {
    const ret = getObject(arg0).getQueryParameter(getObject(arg1), arg2 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getShaderInfoLog_310ce3ce8be1827a(arg0, arg1, arg2) {
    const ret = getObject(arg1).getShaderInfoLog(getObject(arg2));
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_getShaderInfoLog_ab7fd0e53b1cf368(arg0, arg1, arg2) {
    const ret = getObject(arg1).getShaderInfoLog(getObject(arg2));
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_getShaderParameter_993433bf7ac505c2(arg0, arg1, arg2) {
    const ret = getObject(arg0).getShaderParameter(getObject(arg1), arg2 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getShaderParameter_9f6994d1b4e035bb(arg0, arg1, arg2) {
    const ret = getObject(arg0).getShaderParameter(getObject(arg1), arg2 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getSupportedExtensions_98ae01cb23a24162(arg0) {
    const ret = getObject(arg0).getSupportedExtensions();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_getSupportedProfiles_d91b95787dbe7a08(arg0) {
    const ret = getObject(arg0).getSupportedProfiles();
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_getSyncParameter_ca37454c2f068cee(arg0, arg1, arg2) {
    const ret = getObject(arg0).getSyncParameter(getObject(arg1), arg2 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_getUniformBlockIndex_ace4c8ecdb829e04(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).getUniformBlockIndex(getObject(arg1), getStringFromWasm0(arg2, arg3));
    return ret;
}
export function __wbg_getUniformLocation_3dba9eac5289d697(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).getUniformLocation(getObject(arg1), getStringFromWasm0(arg2, arg3));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_getUniformLocation_936adfa97db96e57(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).getUniformLocation(getObject(arg1), getStringFromWasm0(arg2, arg3));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_get_c40e2c3262995a8e(arg0, arg1) {
    const ret = getObject(arg0)[arg1 >>> 0];
    return addHeapObject(ret);
}
export function __wbg_get_dc3e5a093166e258(arg0, arg1) {
    const ret = getObject(arg0)[arg1 >>> 0];
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_get_unchecked_3de5bfaaea65f86b(arg0, arg1) {
    const ret = getObject(arg0)[arg1 >>> 0];
    return addHeapObject(ret);
}
export function __wbg_gpu_d9721d200584e919(arg0) {
    const ret = getObject(arg0).gpu;
    return addHeapObject(ret);
}
export function __wbg_has_2184fc4b845f2b5f(arg0, arg1, arg2) {
    const ret = getObject(arg0).has(getStringFromWasm0(arg1, arg2));
    return ret;
}
export function __wbg_height_0bc0b50e13f16ff4(arg0) {
    const ret = getObject(arg0).height;
    return ret;
}
export function __wbg_height_31b2659c809c5091(arg0) {
    const ret = getObject(arg0).height;
    return ret;
}
export function __wbg_height_3991d9422ca14223(arg0) {
    const ret = getObject(arg0).height;
    return ret;
}
export function __wbg_includes_a548e3f04faa0fba(arg0, arg1, arg2) {
    const ret = getObject(arg0).includes(getObject(arg1), arg2);
    return ret;
}
export function __wbg_instanceof_GpuAdapter_8825bf3533b2dc81(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof GPUAdapter;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_GpuCanvasContext_8867fd6a49dfb80b(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof GPUCanvasContext;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_GpuDeviceLostInfo_9385c1b1d1700172(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof GPUDeviceLostInfo;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_GpuOutOfMemoryError_ad32cc08223bf570(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof GPUOutOfMemoryError;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_GpuValidationError_2828a9f6f4ea2c0b(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof GPUValidationError;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_HtmlCanvasElement_6745c30e85c23ab2(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof HTMLCanvasElement;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_Object_687cb3f0f8443260(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof Object;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_WebGl2RenderingContext_9810fb1b0a140e3f(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof WebGL2RenderingContext;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_Window_0cc62e4f32542cc4(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof Window;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_invalidateFramebuffer_8c7e28d309ab1076() { return handleError(function (arg0, arg1, arg2) {
    getObject(arg0).invalidateFramebuffer(arg1 >>> 0, getObject(arg2));
}, arguments); }
export function __wbg_is_69ce89649136abc6(arg0, arg1) {
    const ret = Object.is(getObject(arg0), getObject(arg1));
    return ret;
}
export function __wbg_label_cdc2b7a875dc5123(arg0, arg1) {
    const ret = getObject(arg1).label;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_length_00dd7227fd4626ad(arg0) {
    const ret = getObject(arg0).length;
    return ret;
}
export function __wbg_length_5e07cf181b2745fb(arg0) {
    const ret = getObject(arg0).length;
    return ret;
}
export function __wbg_length_87e0297027dd7802(arg0) {
    const ret = getObject(arg0).length;
    return ret;
}
export function __wbg_limits_5b3783fcc0d36428(arg0) {
    const ret = getObject(arg0).limits;
    return addHeapObject(ret);
}
export function __wbg_limits_becc24c879d87717(arg0) {
    const ret = getObject(arg0).limits;
    return addHeapObject(ret);
}
export function __wbg_lineNum_24517b98f306fcae(arg0) {
    const ret = getObject(arg0).lineNum;
    return ret;
}
export function __wbg_linkProgram_38eb27f1720142df(arg0, arg1) {
    getObject(arg0).linkProgram(getObject(arg1));
}
export function __wbg_linkProgram_d879c06d6d6c275f(arg0, arg1) {
    getObject(arg0).linkProgram(getObject(arg1));
}
export function __wbg_log_ec5e2734d6e32879(arg0, arg1) {
    console.log(getStringFromWasm0(arg0, arg1));
}
export function __wbg_lost_2c34651e3317be8b(arg0) {
    const ret = getObject(arg0).lost;
    return addHeapObject(ret);
}
export function __wbg_mapAsync_8d0ffc031e86e9a0(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).mapAsync(arg1 >>> 0, arg2, arg3);
    return addHeapObject(ret);
}
export function __wbg_maxBindGroups_5d3409c14d2756b5(arg0) {
    const ret = getObject(arg0).maxBindGroups;
    return ret;
}
export function __wbg_maxBindingsPerBindGroup_512a63ba20ee714c(arg0) {
    const ret = getObject(arg0).maxBindingsPerBindGroup;
    return ret;
}
export function __wbg_maxBufferSize_8cef5a2e6fae09fa(arg0) {
    const ret = getObject(arg0).maxBufferSize;
    return ret;
}
export function __wbg_maxColorAttachmentBytesPerSample_54d9c60b6cdd092a(arg0) {
    const ret = getObject(arg0).maxColorAttachmentBytesPerSample;
    return ret;
}
export function __wbg_maxColorAttachments_378f5fb1c453321d(arg0) {
    const ret = getObject(arg0).maxColorAttachments;
    return ret;
}
export function __wbg_maxComputeInvocationsPerWorkgroup_d8877398fe435d24(arg0) {
    const ret = getObject(arg0).maxComputeInvocationsPerWorkgroup;
    return ret;
}
export function __wbg_maxComputeWorkgroupSizeX_b6f88bafac1581bf(arg0) {
    const ret = getObject(arg0).maxComputeWorkgroupSizeX;
    return ret;
}
export function __wbg_maxComputeWorkgroupSizeY_e1a1ecdbdc9d75d8(arg0) {
    const ret = getObject(arg0).maxComputeWorkgroupSizeY;
    return ret;
}
export function __wbg_maxComputeWorkgroupSizeZ_fe66cf9606e1a594(arg0) {
    const ret = getObject(arg0).maxComputeWorkgroupSizeZ;
    return ret;
}
export function __wbg_maxComputeWorkgroupStorageSize_49c38f3e08b0f760(arg0) {
    const ret = getObject(arg0).maxComputeWorkgroupStorageSize;
    return ret;
}
export function __wbg_maxComputeWorkgroupsPerDimension_8cb3348843013a6b(arg0) {
    const ret = getObject(arg0).maxComputeWorkgroupsPerDimension;
    return ret;
}
export function __wbg_maxDynamicStorageBuffersPerPipelineLayout_6974d29539996dc2(arg0) {
    const ret = getObject(arg0).maxDynamicStorageBuffersPerPipelineLayout;
    return ret;
}
export function __wbg_maxDynamicUniformBuffersPerPipelineLayout_ade9d0536439985a(arg0) {
    const ret = getObject(arg0).maxDynamicUniformBuffersPerPipelineLayout;
    return ret;
}
export function __wbg_maxInterStageShaderComponents_d6dbbdabbd40588b(arg0) {
    const ret = getObject(arg0).maxInterStageShaderComponents;
    return ret;
}
export function __wbg_maxSampledTexturesPerShaderStage_e560c5b5b6029c57(arg0) {
    const ret = getObject(arg0).maxSampledTexturesPerShaderStage;
    return ret;
}
export function __wbg_maxSamplersPerShaderStage_28a8a2de2a3d656e(arg0) {
    const ret = getObject(arg0).maxSamplersPerShaderStage;
    return ret;
}
export function __wbg_maxStorageBufferBindingSize_984825203efcccc6(arg0) {
    const ret = getObject(arg0).maxStorageBufferBindingSize;
    return ret;
}
export function __wbg_maxStorageBuffersPerShaderStage_b81c4449fbcb39c3(arg0) {
    const ret = getObject(arg0).maxStorageBuffersPerShaderStage;
    return ret;
}
export function __wbg_maxStorageTexturesPerShaderStage_175a5e42917aedd2(arg0) {
    const ret = getObject(arg0).maxStorageTexturesPerShaderStage;
    return ret;
}
export function __wbg_maxTextureArrayLayers_8503bb6fd0cdb150(arg0) {
    const ret = getObject(arg0).maxTextureArrayLayers;
    return ret;
}
export function __wbg_maxTextureDimension1D_983c9a563c1855d9(arg0) {
    const ret = getObject(arg0).maxTextureDimension1D;
    return ret;
}
export function __wbg_maxTextureDimension2D_a0a2be37afbde706(arg0) {
    const ret = getObject(arg0).maxTextureDimension2D;
    return ret;
}
export function __wbg_maxTextureDimension3D_53aefd0d779b193e(arg0) {
    const ret = getObject(arg0).maxTextureDimension3D;
    return ret;
}
export function __wbg_maxUniformBufferBindingSize_8fc7ea016caf650c(arg0) {
    const ret = getObject(arg0).maxUniformBufferBindingSize;
    return ret;
}
export function __wbg_maxUniformBuffersPerShaderStage_b159f3442e264f35(arg0) {
    const ret = getObject(arg0).maxUniformBuffersPerShaderStage;
    return ret;
}
export function __wbg_maxVertexAttributes_9c129ee44a6fa783(arg0) {
    const ret = getObject(arg0).maxVertexAttributes;
    return ret;
}
export function __wbg_maxVertexBufferArrayStride_1d0f177a1fdcdf3c(arg0) {
    const ret = getObject(arg0).maxVertexBufferArrayStride;
    return ret;
}
export function __wbg_maxVertexBuffers_e5cf174a3497d472(arg0) {
    const ret = getObject(arg0).maxVertexBuffers;
    return ret;
}
export function __wbg_message_1b27ea1ad3998a9f(arg0, arg1) {
    const ret = getObject(arg1).message;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_message_a77e1a9202609622(arg0, arg1) {
    const ret = getObject(arg1).message;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_message_f762db05c1294eca(arg0, arg1) {
    const ret = getObject(arg1).message;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_messages_4e98c7e63c5efe7b(arg0) {
    const ret = getObject(arg0).messages;
    return addHeapObject(ret);
}
export function __wbg_minStorageBufferOffsetAlignment_fe964dbc6a6d7ff3(arg0) {
    const ret = getObject(arg0).minStorageBufferOffsetAlignment;
    return ret;
}
export function __wbg_minUniformBufferOffsetAlignment_327ef98e308ca208(arg0) {
    const ret = getObject(arg0).minUniformBufferOffsetAlignment;
    return ret;
}
export function __wbg_navigator_ef5f4d029b5c019e(arg0) {
    const ret = getObject(arg0).navigator;
    return addHeapObject(ret);
}
export function __wbg_navigator_fa7a4a353e3eb5bf(arg0) {
    const ret = getObject(arg0).navigator;
    return addHeapObject(ret);
}
export function __wbg_new_227d7c05414eb861() {
    const ret = new Error();
    return addHeapObject(ret);
}
export function __wbg_new_62f131e968c83d75() {
    const ret = new Object();
    return addHeapObject(ret);
}
export function __wbg_new_66075f8c2ea6575e() {
    const ret = new Array();
    return addHeapObject(ret);
}
export function __wbg_new_from_slice_e98c2bb0a59c32a0(arg0, arg1) {
    const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
    return addHeapObject(ret);
}
export function __wbg_new_typed_893dbec5fe999814(arg0, arg1) {
    try {
        var state0 = {a: arg0, b: arg1};
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return __wasm_bindgen_func_elem_5904(a, state0.b, arg0, arg1);
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return addHeapObject(ret);
    } finally {
        state0.a = state0.b = 0;
    }
}
export function __wbg_new_typed_e80fe2772bd6059c() {
    const ret = new Array();
    return addHeapObject(ret);
}
export function __wbg_new_with_byte_offset_and_length_5c494ef1df19d087(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
}
export function __wbg_of_ffa06bb45ad9a8a6(arg0) {
    const ret = Array.of(getObject(arg0));
    return addHeapObject(ret);
}
export function __wbg_offset_164492575e959c94(arg0) {
    const ret = getObject(arg0).offset;
    return ret;
}
export function __wbg_pixelStorei_4ed5f690dffb32ff(arg0, arg1, arg2) {
    getObject(arg0).pixelStorei(arg1 >>> 0, arg2);
}
export function __wbg_pixelStorei_ccb8290afa4f8024(arg0, arg1, arg2) {
    getObject(arg0).pixelStorei(arg1 >>> 0, arg2);
}
export function __wbg_polygonOffset_680901b27bc4585d(arg0, arg1, arg2) {
    getObject(arg0).polygonOffset(arg1, arg2);
}
export function __wbg_polygonOffset_a9ee1d47d2f82bf2(arg0, arg1, arg2) {
    getObject(arg0).polygonOffset(arg1, arg2);
}
export function __wbg_popErrorScope_2869a89dd4626f0c(arg0) {
    const ret = getObject(arg0).popErrorScope();
    return addHeapObject(ret);
}
export function __wbg_prototypesetcall_d1a7133bc8d83aa9(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
}
export function __wbg_pushErrorScope_72e651b0f8f64c0e(arg0, arg1) {
    getObject(arg0).pushErrorScope(__wbindgen_enum_GpuErrorFilter[arg1]);
}
export function __wbg_push_960865cda81df836(arg0, arg1) {
    const ret = getObject(arg0).push(getObject(arg1));
    return ret;
}
export function __wbg_querySelectorAll_11b4366af541df3f() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).querySelectorAll(getStringFromWasm0(arg1, arg2));
    return addHeapObject(ret);
}, arguments); }
export function __wbg_querySelector_4e14456d3294d0bc() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).querySelector(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}, arguments); }
export function __wbg_queueMicrotask_622e69f0935dfab2(arg0) {
    const ret = getObject(arg0).queueMicrotask;
    return addHeapObject(ret);
}
export function __wbg_queueMicrotask_d0528786d26e067c(arg0) {
    queueMicrotask(getObject(arg0));
}
export function __wbg_queue_6b07ccdd49a6ba90(arg0) {
    const ret = getObject(arg0).queue;
    return addHeapObject(ret);
}
export function __wbg_readBuffer_731e1fc3599181b6(arg0, arg1) {
    getObject(arg0).readBuffer(arg1 >>> 0);
}
export function __wbg_readPixels_70ad14c9a9251d37() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
    getObject(arg0).readPixels(arg1, arg2, arg3, arg4, arg5 >>> 0, arg6 >>> 0, arg7);
}, arguments); }
export function __wbg_readPixels_a4558ba21f0276f3() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
    getObject(arg0).readPixels(arg1, arg2, arg3, arg4, arg5 >>> 0, arg6 >>> 0, getObject(arg7));
}, arguments); }
export function __wbg_readPixels_c5624ab269ffbb81() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
    getObject(arg0).readPixels(arg1, arg2, arg3, arg4, arg5 >>> 0, arg6 >>> 0, getObject(arg7));
}, arguments); }
export function __wbg_reason_d7f4ddcad86f8d99(arg0) {
    const ret = getObject(arg0).reason;
    return (__wbindgen_enum_GpuDeviceLostReason.indexOf(ret) + 1 || 3) - 1;
}
export function __wbg_renderbufferStorageMultisample_52372d9b5b225e67(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).renderbufferStorageMultisample(arg1 >>> 0, arg2, arg3 >>> 0, arg4, arg5);
}
export function __wbg_renderbufferStorage_39b7c5621e2ce253(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).renderbufferStorage(arg1 >>> 0, arg2 >>> 0, arg3, arg4);
}
export function __wbg_renderbufferStorage_ea3fb2c3615e2da8(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).renderbufferStorage(arg1 >>> 0, arg2 >>> 0, arg3, arg4);
}
export function __wbg_rendererstate_new(arg0) {
    const ret = RendererState.__wrap(arg0);
    return addHeapObject(ret);
}
export function __wbg_requestAdapter_e4b32f2647c66726(arg0, arg1) {
    const ret = getObject(arg0).requestAdapter(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_requestDevice_6130c3ba10d633f9(arg0, arg1) {
    const ret = getObject(arg0).requestDevice(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_resolveQuerySet_217f20ef3ebd6aed(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).resolveQuerySet(getObject(arg1), arg2 >>> 0, arg3 >>> 0, getObject(arg4), arg5 >>> 0);
}
export function __wbg_resolve_d170483d75a2c8a1(arg0) {
    const ret = Promise.resolve(getObject(arg0));
    return addHeapObject(ret);
}
export function __wbg_samplerParameterf_e5a2d3ba1397ab66(arg0, arg1, arg2, arg3) {
    getObject(arg0).samplerParameterf(getObject(arg1), arg2 >>> 0, arg3);
}
export function __wbg_samplerParameteri_ae8ae004943aecb1(arg0, arg1, arg2, arg3) {
    getObject(arg0).samplerParameteri(getObject(arg1), arg2 >>> 0, arg3);
}
export function __wbg_scissor_5bd4ad4284b8f0d2(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).scissor(arg1, arg2, arg3, arg4);
}
export function __wbg_scissor_d02de8c3992e3355(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).scissor(arg1, arg2, arg3, arg4);
}
export function __wbg_setBindGroup_1602c955be9b2eaa(arg0, arg1, arg2) {
    getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2));
}
export function __wbg_setBindGroup_6149584f04998372(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2), getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
}
export function __wbg_setBindGroup_8d384b1c5ed329f4(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2), getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
}
export function __wbg_setBindGroup_9877b57492cb7e1c(arg0, arg1, arg2) {
    getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2));
}
export function __wbg_setBindGroup_f4d552dcef65a491(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2), getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
}
export function __wbg_setBindGroup_f930832baeb4279b(arg0, arg1, arg2) {
    getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2));
}
export function __wbg_setBlendConstant_257274277b0e3153(arg0, arg1) {
    getObject(arg0).setBlendConstant(getObject(arg1));
}
export function __wbg_setIndexBuffer_4219294fa3e2d59b(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).setIndexBuffer(getObject(arg1), __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
}
export function __wbg_setIndexBuffer_5eb14c0c19ab80c2(arg0, arg1, arg2, arg3) {
    getObject(arg0).setIndexBuffer(getObject(arg1), __wbindgen_enum_GpuIndexFormat[arg2], arg3);
}
export function __wbg_setIndexBuffer_7e208bb69310ed01(arg0, arg1, arg2, arg3) {
    getObject(arg0).setIndexBuffer(getObject(arg1), __wbindgen_enum_GpuIndexFormat[arg2], arg3);
}
export function __wbg_setIndexBuffer_f0ab50b0e1d8658c(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).setIndexBuffer(getObject(arg1), __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
}
export function __wbg_setPipeline_481f34ae14c49d67(arg0, arg1) {
    getObject(arg0).setPipeline(getObject(arg1));
}
export function __wbg_setPipeline_723820e1c5cc61e7(arg0, arg1) {
    getObject(arg0).setPipeline(getObject(arg1));
}
export function __wbg_setPipeline_f2cf83769bb33769(arg0, arg1) {
    getObject(arg0).setPipeline(getObject(arg1));
}
export function __wbg_setScissorRect_0578b1de90caf434(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).setScissorRect(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_setStencilReference_7616273572b1075e(arg0, arg1) {
    getObject(arg0).setStencilReference(arg1 >>> 0);
}
export function __wbg_setVertexBuffer_54536e0e73bfc91e(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).setVertexBuffer(arg1 >>> 0, getObject(arg2), arg3, arg4);
}
export function __wbg_setVertexBuffer_8dd1cb9fbc714a98(arg0, arg1, arg2, arg3) {
    getObject(arg0).setVertexBuffer(arg1 >>> 0, getObject(arg2), arg3);
}
export function __wbg_setVertexBuffer_c643d7ac0abf4554(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).setVertexBuffer(arg1 >>> 0, getObject(arg2), arg3, arg4);
}
export function __wbg_setVertexBuffer_caad1ac6b71dea4a(arg0, arg1, arg2, arg3) {
    getObject(arg0).setVertexBuffer(arg1 >>> 0, getObject(arg2), arg3);
}
export function __wbg_setViewport_94128a2b1a708040(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).setViewport(arg1, arg2, arg3, arg4, arg5, arg6);
}
export function __wbg_set_8326741805409e83() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
    return ret;
}, arguments); }
export function __wbg_set_ae98750d709489e0(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
}
export function __wbg_set_height_7dd5e784e99d750f(arg0, arg1) {
    getObject(arg0).height = arg1 >>> 0;
}
export function __wbg_set_height_84becc5dde865711(arg0, arg1) {
    getObject(arg0).height = arg1 >>> 0;
}
export function __wbg_set_onuncapturederror_729c2e42c36923f4(arg0, arg1) {
    getObject(arg0).onuncapturederror = getObject(arg1);
}
export function __wbg_set_width_bf13f94162a1c19f(arg0, arg1) {
    getObject(arg0).width = arg1 >>> 0;
}
export function __wbg_set_width_de6a14a7fd9b3fdf(arg0, arg1) {
    getObject(arg0).width = arg1 >>> 0;
}
export function __wbg_shaderSource_3e6206cae563d41e(arg0, arg1, arg2, arg3) {
    getObject(arg0).shaderSource(getObject(arg1), getStringFromWasm0(arg2, arg3));
}
export function __wbg_shaderSource_4bc53714bcd445d2(arg0, arg1, arg2, arg3) {
    getObject(arg0).shaderSource(getObject(arg1), getStringFromWasm0(arg2, arg3));
}
export function __wbg_size_1dfbf7241f9df1cc(arg0) {
    const ret = getObject(arg0).size;
    return ret;
}
export function __wbg_stack_3b0d974bbf31e44f(arg0, arg1) {
    const ret = getObject(arg1).stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_static_accessor_GLOBAL_THIS_6614f2f4998e3c4c() {
    const ret = typeof globalThis === 'undefined' ? null : globalThis;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_static_accessor_GLOBAL_d8e8a2fefe80bc1d() {
    const ret = typeof global === 'undefined' ? null : global;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_static_accessor_SELF_e29eaf7c465526b1() {
    const ret = typeof self === 'undefined' ? null : self;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_static_accessor_WINDOW_66e7ca3eef30585a() {
    const ret = typeof window === 'undefined' ? null : window;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
export function __wbg_stencilFuncSeparate_5f1ff81c4f0c17ff(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).stencilFuncSeparate(arg1 >>> 0, arg2 >>> 0, arg3, arg4 >>> 0);
}
export function __wbg_stencilFuncSeparate_a67e2af7289d04a3(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).stencilFuncSeparate(arg1 >>> 0, arg2 >>> 0, arg3, arg4 >>> 0);
}
export function __wbg_stencilMaskSeparate_232a7061e2e1cc46(arg0, arg1, arg2) {
    getObject(arg0).stencilMaskSeparate(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_stencilMaskSeparate_880824f0916b2b56(arg0, arg1, arg2) {
    getObject(arg0).stencilMaskSeparate(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_stencilMask_69d73d94804a1d45(arg0, arg1) {
    getObject(arg0).stencilMask(arg1 >>> 0);
}
export function __wbg_stencilMask_c32319e58404d8aa(arg0, arg1) {
    getObject(arg0).stencilMask(arg1 >>> 0);
}
export function __wbg_stencilOpSeparate_13e490d25d3ab2f0(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).stencilOpSeparate(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_stencilOpSeparate_b4efbb0f98437a29(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).stencilOpSeparate(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_submit_60f2469dc00130cc(arg0, arg1) {
    getObject(arg0).submit(getObject(arg1));
}
export function __wbg_texImage2D_28b4dbb9fbc436dc() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, getObject(arg9));
}, arguments); }
export function __wbg_texImage2D_e3fe35cc03a41506() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, getObject(arg9));
}, arguments); }
export function __wbg_texImage3D_3dc9f18607588281() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) {
    getObject(arg0).texImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8 >>> 0, arg9 >>> 0, getObject(arg10));
}, arguments); }
export function __wbg_texParameteri_4c93a6385173065e(arg0, arg1, arg2, arg3) {
    getObject(arg0).texParameteri(arg1 >>> 0, arg2 >>> 0, arg3);
}
export function __wbg_texParameteri_c562c1edac520ce2(arg0, arg1, arg2, arg3) {
    getObject(arg0).texParameteri(arg1 >>> 0, arg2 >>> 0, arg3);
}
export function __wbg_texStorage2D_f6cb5a5dc3cb1f03(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).texStorage2D(arg1 >>> 0, arg2, arg3 >>> 0, arg4, arg5);
}
export function __wbg_texStorage3D_629fb7249722a5f1(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).texStorage3D(arg1 >>> 0, arg2, arg3 >>> 0, arg4, arg5, arg6);
}
export function __wbg_texSubImage2D_2cbd08079a64a7ba() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, getObject(arg9));
}, arguments); }
export function __wbg_texSubImage2D_3ca3a68591cad437() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, getObject(arg9));
}, arguments); }
export function __wbg_texSubImage2D_66736fddad49f99f() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, getObject(arg9));
}, arguments); }
export function __wbg_texSubImage2D_a663f0be5c390aa1() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, arg9);
}, arguments); }
export function __wbg_texSubImage2D_ac9ed7d5aa77e1d4() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, getObject(arg9));
}, arguments); }
export function __wbg_texSubImage2D_bd43343f588b8032() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
    getObject(arg0).texSubImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, getObject(arg9));
}, arguments); }
export function __wbg_texSubImage3D_5e43686bb910c3f3() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
    getObject(arg0).texSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, arg10 >>> 0, getObject(arg11));
}, arguments); }
export function __wbg_texSubImage3D_8d402d6b13474896() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
    getObject(arg0).texSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, arg10 >>> 0, getObject(arg11));
}, arguments); }
export function __wbg_texSubImage3D_a92c7c0e5fc0c085() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
    getObject(arg0).texSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, arg10 >>> 0, getObject(arg11));
}, arguments); }
export function __wbg_texSubImage3D_c0e00d93f9c5f441() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
    getObject(arg0).texSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, arg10 >>> 0, arg11);
}, arguments); }
export function __wbg_texSubImage3D_e59ecce6a9238b94() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
    getObject(arg0).texSubImage3D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9 >>> 0, arg10 >>> 0, getObject(arg11));
}, arguments); }
export function __wbg_then_1170ade08ea65bc7(arg0, arg1, arg2) {
    const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
}
export function __wbg_then_2efb2ae462ac0f4d(arg0, arg1, arg2) {
    const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
}
export function __wbg_then_56ebb7bf138b258b(arg0, arg1) {
    const ret = getObject(arg0).then(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_then_fdc17de424bf508a(arg0, arg1) {
    const ret = getObject(arg0).then(getObject(arg1));
    return addHeapObject(ret);
}
export function __wbg_type_4b0a304ebc25e195(arg0) {
    const ret = getObject(arg0).type;
    return (__wbindgen_enum_GpuCompilationMessageType.indexOf(ret) + 1 || 4) - 1;
}
export function __wbg_uniform1f_4e179627d205aae5(arg0, arg1, arg2) {
    getObject(arg0).uniform1f(getObject(arg1), arg2);
}
export function __wbg_uniform1f_f5c96dd18cca9d69(arg0, arg1, arg2) {
    getObject(arg0).uniform1f(getObject(arg1), arg2);
}
export function __wbg_uniform1i_67598990687224d8(arg0, arg1, arg2) {
    getObject(arg0).uniform1i(getObject(arg1), arg2);
}
export function __wbg_uniform1i_df146a35c85a299d(arg0, arg1, arg2) {
    getObject(arg0).uniform1i(getObject(arg1), arg2);
}
export function __wbg_uniform1ui_ce73bcbbb0176684(arg0, arg1, arg2) {
    getObject(arg0).uniform1ui(getObject(arg1), arg2 >>> 0);
}
export function __wbg_uniform2fv_301a2795100dc891(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform2fv(getObject(arg1), getArrayF32FromWasm0(arg2, arg3));
}
export function __wbg_uniform2fv_30f3f3873d1a0acc(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform2fv(getObject(arg1), getArrayF32FromWasm0(arg2, arg3));
}
export function __wbg_uniform2iv_11bfd5c82e9f36ca(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform2iv(getObject(arg1), getArrayI32FromWasm0(arg2, arg3));
}
export function __wbg_uniform2iv_32063c229c3105e8(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform2iv(getObject(arg1), getArrayI32FromWasm0(arg2, arg3));
}
export function __wbg_uniform2uiv_dc3a8cf65689032f(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform2uiv(getObject(arg1), getArrayU32FromWasm0(arg2, arg3));
}
export function __wbg_uniform3fv_0aab12aa64c79e68(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform3fv(getObject(arg1), getArrayF32FromWasm0(arg2, arg3));
}
export function __wbg_uniform3fv_8c8def73813869f4(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform3fv(getObject(arg1), getArrayF32FromWasm0(arg2, arg3));
}
export function __wbg_uniform3iv_1bd06945b06bcb59(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform3iv(getObject(arg1), getArrayI32FromWasm0(arg2, arg3));
}
export function __wbg_uniform3iv_bd51a2858aaba50d(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform3iv(getObject(arg1), getArrayI32FromWasm0(arg2, arg3));
}
export function __wbg_uniform3uiv_6df194d265be79c2(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform3uiv(getObject(arg1), getArrayU32FromWasm0(arg2, arg3));
}
export function __wbg_uniform4f_90992ea514751c5b(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).uniform4f(getObject(arg1), arg2, arg3, arg4, arg5);
}
export function __wbg_uniform4f_ed8855ebf288a6f0(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).uniform4f(getObject(arg1), arg2, arg3, arg4, arg5);
}
export function __wbg_uniform4fv_a0604d3693ca0a79(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform4fv(getObject(arg1), getArrayF32FromWasm0(arg2, arg3));
}
export function __wbg_uniform4fv_e7d262a92cf60f5c(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform4fv(getObject(arg1), getArrayF32FromWasm0(arg2, arg3));
}
export function __wbg_uniform4iv_950e67bcbe605895(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform4iv(getObject(arg1), getArrayI32FromWasm0(arg2, arg3));
}
export function __wbg_uniform4iv_b9862bdca1c7fe75(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform4iv(getObject(arg1), getArrayI32FromWasm0(arg2, arg3));
}
export function __wbg_uniform4uiv_a866980d8b804817(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniform4uiv(getObject(arg1), getArrayU32FromWasm0(arg2, arg3));
}
export function __wbg_uniformBlockBinding_bd9b607506f55b53(arg0, arg1, arg2, arg3) {
    getObject(arg0).uniformBlockBinding(getObject(arg1), arg2 >>> 0, arg3 >>> 0);
}
export function __wbg_uniformMatrix2fv_1b2cb249f747214f(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix2fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix2fv_cda1ec6e4a20db52(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix2fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix2x3fv_ea322518bfc32618(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix2x3fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix2x4fv_773eeba18ad7a0a5(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix2x4fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix3fv_22f39df03aaddb8a(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix3fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix3fv_4d8a74fa51db1715(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix3fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix3x2fv_17f0aed19def36cc(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix3x2fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix3x4fv_c668a7d462fec866(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix3x4fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix4fv_c0ce5081865ceb04(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix4fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix4fv_e40a348ded6667b6(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix4fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix4x2fv_c18c6c97cebe4837(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix4x2fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_uniformMatrix4x3fv_44607399c8282a7d(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).uniformMatrix4x3fv(getObject(arg1), arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}
export function __wbg_unmap_4aa38f8c5283cc1d(arg0) {
    getObject(arg0).unmap();
}
export function __wbg_usage_ee2982f59567c06f(arg0) {
    const ret = getObject(arg0).usage;
    return ret;
}
export function __wbg_useProgram_14ec271ef95cb9d1(arg0, arg1) {
    getObject(arg0).useProgram(getObject(arg1));
}
export function __wbg_useProgram_dc95c7dd28174cb4(arg0, arg1) {
    getObject(arg0).useProgram(getObject(arg1));
}
export function __wbg_valueOf_6911b1437761e919(arg0) {
    const ret = getObject(arg0).valueOf();
    return addHeapObject(ret);
}
export function __wbg_vertexAttribDivisorANGLE_c1deb10ecbd7d4ee(arg0, arg1, arg2) {
    getObject(arg0).vertexAttribDivisorANGLE(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_vertexAttribDivisor_5764dbf380148782(arg0, arg1, arg2) {
    getObject(arg0).vertexAttribDivisor(arg1 >>> 0, arg2 >>> 0);
}
export function __wbg_vertexAttribIPointer_74365bc8ec5ec561(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).vertexAttribIPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4, arg5);
}
export function __wbg_vertexAttribPointer_29ca546313b9e71c(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).vertexAttribPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4 !== 0, arg5, arg6);
}
export function __wbg_vertexAttribPointer_a344ea016a42bf53(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    getObject(arg0).vertexAttribPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4 !== 0, arg5, arg6);
}
export function __wbg_videoHeight_600a6b7ef78ea8e7(arg0) {
    const ret = getObject(arg0).videoHeight;
    return ret;
}
export function __wbg_videoWidth_24bc4214533b3b24(arg0) {
    const ret = getObject(arg0).videoWidth;
    return ret;
}
export function __wbg_viewport_017c70ca5a88005e(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).viewport(arg1, arg2, arg3, arg4);
}
export function __wbg_viewport_c71ba95da62d7ab4(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).viewport(arg1, arg2, arg3, arg4);
}
export function __wbg_width_12d0b6a95084d00c(arg0) {
    const ret = getObject(arg0).width;
    return ret;
}
export function __wbg_width_4d14cb543ae55efe(arg0) {
    const ret = getObject(arg0).width;
    return ret;
}
export function __wbg_width_de2956388191fb8d(arg0) {
    const ret = getObject(arg0).width;
    return ret;
}
export function __wbg_writeBuffer_b5e6e8f3f93629bc(arg0, arg1, arg2, arg3, arg4, arg5) {
    getObject(arg0).writeBuffer(getObject(arg1), arg2, getObject(arg3), arg4, arg5);
}
export function __wbg_writeTexture_57e41dd94bac65c4(arg0, arg1, arg2, arg3, arg4) {
    getObject(arg0).writeTexture(getObject(arg1), getObject(arg2), getObject(arg3), getObject(arg4));
}
export function __wbindgen_cast_0000000000000001(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 1139, function: Function { arguments: [Externref], shim_idx: 1140, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_2576, __wasm_bindgen_func_elem_2577);
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000002(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 90, function: Function { arguments: [Externref], shim_idx: 91, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_731, __wasm_bindgen_func_elem_732);
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000003(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 90, function: Function { arguments: [NamedExternref("GPUUncapturedErrorEvent")], shim_idx: 91, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_731, __wasm_bindgen_func_elem_732_2);
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000004(arg0) {
    // Cast intrinsic for `F64 -> Externref`.
    const ret = arg0;
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000005(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(F32)) -> NamedExternref("Float32Array")`.
    const ret = getArrayF32FromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000006(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(I16)) -> NamedExternref("Int16Array")`.
    const ret = getArrayI16FromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000007(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(I32)) -> NamedExternref("Int32Array")`.
    const ret = getArrayI32FromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000008(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(I8)) -> NamedExternref("Int8Array")`.
    const ret = getArrayI8FromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_cast_0000000000000009(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(U16)) -> NamedExternref("Uint16Array")`.
    const ret = getArrayU16FromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_cast_000000000000000a(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(U32)) -> NamedExternref("Uint32Array")`.
    const ret = getArrayU32FromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_cast_000000000000000b(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
    const ret = getArrayU8FromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_cast_000000000000000c(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
}
export function __wbindgen_object_clone_ref(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
}
export function __wbindgen_object_drop_ref(arg0) {
    takeObject(arg0);
}
function __wasm_bindgen_func_elem_732(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_732(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_732_2(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_732_2(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_2577(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.__wasm_bindgen_func_elem_2577(retptr, arg0, arg1, addHeapObject(arg2));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function __wasm_bindgen_func_elem_5904(arg0, arg1, arg2, arg3) {
    wasm.__wasm_bindgen_func_elem_5904(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}


const __wbindgen_enum_GpuCompilationMessageType = ["error", "warning", "info"];


const __wbindgen_enum_GpuDeviceLostReason = ["unknown", "destroyed"];


const __wbindgen_enum_GpuErrorFilter = ["validation", "out-of-memory", "internal"];


const __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"];


const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];
const RendererStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rendererstate_free(ptr >>> 0, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => state.dtor(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getArrayU16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedInt16ArrayMemory0 = null;
function getInt16ArrayMemory0() {
    if (cachedInt16ArrayMemory0 === null || cachedInt16ArrayMemory0.byteLength === 0) {
        cachedInt16ArrayMemory0 = new Int16Array(wasm.memory.buffer);
    }
    return cachedInt16ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

let cachedInt8ArrayMemory0 = null;
function getInt8ArrayMemory0() {
    if (cachedInt8ArrayMemory0 === null || cachedInt8ArrayMemory0.byteLength === 0) {
        cachedInt8ArrayMemory0 = new Int8Array(wasm.memory.buffer);
    }
    return cachedInt8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export3(addHeapObject(e));
    }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            state.dtor(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
