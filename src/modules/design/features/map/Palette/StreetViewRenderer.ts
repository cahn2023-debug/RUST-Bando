/**
 * StreetViewJS.ts - Pure WebGL Panorama Engine
 * No external dependencies.
 */

interface WebGLContext {
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    buffers: {
        position: WebGLBuffer;
        texture: WebGLBuffer;
    };
    texture: WebGLTexture | null;
}

export class StreetViewRenderer {
    private container: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private ctx: WebGLContext | null = null;
    private animationFrame: number | null = null;

    private heading: number = 0;
    private pitch: number = 0;
    private fov: number = 75;

    constructor(container: HTMLDivElement) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.container.appendChild(this.canvas);

        this.initWebGL();
        this.resize();
    }

    private initWebGL() {
        const gl = this.canvas.getContext('webgl', { antialias: true });
        if (!gl) {
            console.error('WebGL not supported');
            return;
        }

        const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uViewMatrix;
            varying highp vec2 vTextureCoord;
            void main() {
                gl_Position = uProjectionMatrix * uViewMatrix * aVertexPosition;
                vTextureCoord = aTextureCoord;
            }
        `;

        const fsSource = `
            varying highp vec2 vTextureCoord;
            uniform sampler2D uSampler;
            void main() {
                gl_FragColor = texture2D(uSampler, vTextureCoord);
            }
        `;

        const shaderProgram = this.initShaderProgram(gl, vsSource, fsSource);
        if (!shaderProgram) return;

        const buffers = this.initBuffers(gl);

        this.ctx = {
            gl,
            program: shaderProgram,
            buffers,
            texture: null
        };

        this.startRendering();
    }

    private initBuffers(gl: WebGLRenderingContext) {
        // Create a sphere or just a large cube/quad for simple panorama
        // For efficiency, we can use a sphere geometry
        const positions: number[] = [];
        const textureCoords: number[] = [];
        const indices: number[] = [];

        const latBands = 30;
        const longBands = 30;
        const radius = 10;

        for (let latNumber = 0; latNumber <= latBands; latNumber++) {
            const theta = latNumber * Math.PI / latBands;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let longNumber = 0; longNumber <= longBands; longNumber++) {
                const phi = longNumber * 2 * Math.PI / longBands;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = cosTheta;
                const z = sinPhi * sinTheta;
                const u = 1 - (longNumber / longBands);
                const v = 1 - (latNumber / latBands);

                positions.push(radius * x, radius * y, radius * z);
                textureCoords.push(u, v);
            }
        }

        for (let latNumber = 0; latNumber < latBands; latNumber++) {
            for (let longNumber = 0; longNumber < longBands; longNumber++) {
                const first = (latNumber * (longBands + 1)) + longNumber;
                const second = first + longBands + 1;
                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        const positionBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const texCoordBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        return {
            position: positionBuffer,
            texture: texCoordBuffer,
            index: indexBuffer,
            count: indices.length
        } as any;
    }

    public setImage(url: string) {
        if (!this.ctx) return;
        const gl = this.ctx.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Put a single pixel in while waiting for load
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.ctx!.texture = texture;
        };
        image.src = url;
    }

    public setPov(heading: number, pitch: number, fov: number) {
        this.heading = heading;
        this.pitch = pitch;
        this.fov = fov;
    }

    public resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.container.clientWidth * dpr;
        this.canvas.height = this.container.clientHeight * dpr;
        if (this.ctx) {
            this.ctx.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    private startRendering() {
        const render = () => {
            this.drawScene();
            this.animationFrame = requestAnimationFrame(render);
        };
        this.animationFrame = requestAnimationFrame(render);
    }

    private drawScene() {
        if (!this.ctx || !this.ctx.texture) return;
        const gl = this.ctx.gl;

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const aspect = gl.canvas.width / gl.canvas.height;
        const zNear = 0.1;
        const zFar = 100.0;

        // Manual Matrix calculations to avoid libs
        const projectionMatrix = this.perspective(this.fov * Math.PI / 180, aspect, zNear, zFar);

        // View Matrix based on heading and pitch
        let viewMatrix = this.identity();
        viewMatrix = this.rotateX(viewMatrix, this.pitch * Math.PI / 180);
        viewMatrix = this.rotateY(viewMatrix, -this.heading * Math.PI / 180);

        gl.useProgram(this.ctx.program);

        const posLoc = gl.getAttribLocation(this.ctx.program, 'aVertexPosition');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.buffers.position);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(posLoc);

        const texLoc = gl.getAttribLocation(this.ctx.program, 'aTextureCoord');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.buffers.texture);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(texLoc);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.ctx.texture);
        gl.uniform1i(gl.getUniformLocation(this.ctx.program, 'uSampler'), 0);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.ctx.program, 'uProjectionMatrix'), false, projectionMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.ctx.program, 'uViewMatrix'), false, viewMatrix);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, (this.ctx.buffers as any).index);
        gl.drawElements(gl.TRIANGLES, (this.ctx.buffers as any).count, gl.UNSIGNED_SHORT, 0);
    }

    // Basic Math Utilities
    private identity() {
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }

    private perspective(fovy: number, aspect: number, near: number, far: number) {
        const f = 1.0 / Math.tan(fovy / 2);
        const nf = 1 / (near - far);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, (2 * far * near) * nf, 0
        ]);
    }

    private rotateY(m: Float32Array, angle: number) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const res = new Float32Array(m);
        res[0] = m[0] * c + m[8] * s;
        res[2] = m[2] * c + m[10] * s;
        res[8] = m[8] * c - m[0] * s;
        res[10] = m[10] * c - m[2] * s;
        return res;
    }

    private rotateX(m: Float32Array, angle: number) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const res = new Float32Array(m);
        res[5] = m[5] * c - m[9] * s;
        res[6] = m[6] * c - m[10] * s;
        res[9] = m[9] * c + m[5] * s;
        res[10] = m[10] * c + m[6] * s;
        return res;
    }

    private initShaderProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
        const vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vs)!;
        const fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fs)!;
        const shaderProgram = gl.createProgram()!;
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);
        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            return null;
        }
        return shaderProgram;
    }

    private loadShader(gl: WebGLRenderingContext, type: number, source: string) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    public destroy() {
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        if (this.ctx) {
            const gl = this.ctx.gl;
            gl.deleteProgram(this.ctx.program);
            gl.deleteBuffer(this.ctx.buffers.position);
            gl.deleteBuffer(this.ctx.buffers.texture);
            if (this.ctx.texture) gl.deleteTexture(this.ctx.texture);
        }
        this.canvas.remove();
        this.ctx = null;
    }
}
