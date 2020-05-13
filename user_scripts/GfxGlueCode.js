'use strict';
/*
 Copyright (C) 2010-2016 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GfxGlueCode {
    constructor(width, height) {
        this.graphicsFound = false; //Do we have graphics output sink found yet?
        this.gfxCallback = null; //Optional callback user-supplied for vsync eventing.
        this.doSmoothing = true; //Texture filter the framebuffer?
        this.offscreenWidth = width; //Width of the screen.
        this.offscreenHeight = height; //Height of the screen.
        this.offscreenRGBCount = this.offscreenWidth * this.offscreenHeight * 3;
        this.offscreenRGBACount = this.offscreenWidth * this.offscreenHeight * 4;
        this.initializeVSync(); //Setup the vsync event.
        this.initializeBuffers(); //Initialize the buffer storage.
    }

    initializeVSync() {
        window.requestAnimationFrame =
            window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
        if (!window.requestAnimationFrame) {
            //Fallback timer eventing:
            setInterval(() => {
                this.vsync();
            }, 16);
        } else {
            //Initialize the rAF eventing:
            window.requestAnimationFrame(() => {
                this.vsync();
                this.rAFKeepAlive();
            });
        }
    }

    rAFKeepAlive() {
        //Keep the vsync event requested:
        window.requestAnimationFrame(() => {
            this.vsync();
            this.rAFKeepAlive();
        });
    }

    attachCanvas(canvas) {
        this.canvas = canvas;
        this.graphicsFound = this.initializeCanvasTarget();
    }

    detachCanvas() {
        this.canvas = null;
    }

    attachGfxCallback(gfxCallback) {
        if (typeof gfxCallback == 'function') {
            this.gfxCallback = gfxCallback;
        }
    }

    attachGfxPostCallback(gfxPostCallback) {
        if (typeof gfxPostCallback == 'function') {
            this.gfxPostCallback = gfxPostCallback;
        }
    }

    vsync() {
        if (this.graphicsFound) {
            if (typeof this.gfxCallback == 'function') {
                //Let the user supplied code prepare a frame or two:
                this.gfxCallback();
            }
            //Draw a frame, if ready:
            this.requestDraw();
        }
    }

    initializeBuffers() {
        this.swizzledFrameFree = [getUint8Array(this.offscreenRGBCount), getUint8Array(this.offscreenRGBCount)];
        this.swizzledFrameReady = [];
    }

    recomputeDimension() {
        //Cache some dimension info:
        this.canvasLastWidth = this.canvas.clientWidth;
        this.canvasLastHeight = this.canvas.clientHeight;
        if (navigator.userAgent.toLowerCase().indexOf('gecko') != -1 && navigator.userAgent.toLowerCase().indexOf('like gecko') == -1) {
            //Sniff out firefox for selecting this path.
            //Set target as unscaled:
            this.onscreenWidth = this.canvas.width = this.offscreenWidth;
            this.onscreenHeight = this.canvas.height = this.offscreenHeight;
        } else {
            //Set target canvas as scaled:
            this.onscreenWidth = this.canvas.width = this.canvas.clientWidth;
            this.onscreenHeight = this.canvas.height = this.canvas.clientHeight;
        }
    }

    initializeCanvasTarget() {
        try {
            //Obtain dimensional information:
            this.recomputeDimension();
            //Get handles on the canvases:
            this.canvasOffscreen = document.createElement('canvas');
            this.canvasOffscreen.width = this.offscreenWidth;
            this.canvasOffscreen.height = this.offscreenHeight;
            this.drawContextOffscreen = this.canvasOffscreen.getContext('2d');
            this.drawContextOnscreen = this.canvas.getContext('2d');
            //Initialize the canvas backing buffer:
            this.initializeCanvasBuffer();
            //Success:
            return true;
        } catch (error) {
            //Failure:
            return false;
        }
    }

    initializeCanvasBuffer() {
        //Get a CanvasPixelArray buffer:
        this.canvasBuffer = this.getBuffer(this.drawContextOffscreen, this.offscreenWidth, this.offscreenHeight);
        //Initialize Alpha Channel:
        this.initializeAlpha(this.canvasBuffer.data);
    }

    initializeAlpha(canvasData) {
        for (let indexGFXIterate = 3; indexGFXIterate < canvasData.length; indexGFXIterate += 4) {
            canvasData[indexGFXIterate] = 0xff;
        }
    }

    getBuffer(canvasContext, width, height) {
        //Get a CanvasPixelArray buffer:
        let buffer = null;
        try {
            buffer = this.drawContextOffscreen.createImageData(width, height);
        } catch (error) {
            buffer = this.drawContextOffscreen.getImageData(0, 0, width, height);
        }
        return buffer;
    }

    copyBuffer(buffer) {
        if (this.graphicsFound && __VIEWS_SUPPORTED__) {
            if (this.swizzledFrameFree.length == 0) {
                this.swizzledFrameFree.push(this.swizzledFrameReady.shift());
            }
            const swizzledFrame = this.swizzledFrameFree.shift();
            swizzledFrame.set(buffer);
            this.swizzledFrameReady.push(swizzledFrame);
        } else {
            if (this.swizzledFrameFree.length == 0) {
                this.swizzledFrameFree.push(this.swizzledFrameReady.shift());
            }
            const swizzledFrame = this.swizzledFrameFree.shift();
            for (let bufferIndex = 0; bufferIndex < this.offscreenRGBCount; bufferIndex++) {
                swizzledFrame[bufferIndex] = buffer[bufferIndex];
            }
            this.swizzledFrameReady.push(swizzledFrame);
        }
    }

    requestDraw() {
        if (this.swizzledFrameReady.length > 0) {
            const canvasData = this.canvasBuffer.data;
            const swizzledFrame = this.swizzledFrameReady.shift();
            for (let canvasIndex = 0, bufferIndex = 0; canvasIndex < this.offscreenRGBACount; ++canvasIndex) {
                canvasData[canvasIndex++] = swizzledFrame[bufferIndex++];
                canvasData[canvasIndex++] = swizzledFrame[bufferIndex++];
                canvasData[canvasIndex++] = swizzledFrame[bufferIndex++];
            }
            this.swizzledFrameFree.push(swizzledFrame);
            this.graphicsBlit();
            if (typeof this.gfxPostCallback == 'function') {
                //Some UI element redraw:
                this.gfxPostCallback();
            }
        }
    }

    graphicsBlit() {
        if (this.canvasLastWidth != this.canvas.clientWidth || this.canvasLastHeight != this.canvas.clientHeight) {
            this.recomputeDimension();
            this.processSmoothing();
        }
        if (this.offscreenWidth == this.onscreenWidth && this.offscreenHeight == this.onscreenHeight) {
            //Canvas does not need to scale, draw directly to final:
            this.drawContextOnscreen.putImageData(this.canvasBuffer, 0, 0);
        } else {
            //Canvas needs to scale, draw to offscreen first:
            this.drawContextOffscreen.putImageData(this.canvasBuffer, 0, 0);
            //Scale offscreen canvas image onto the final:
            this.drawContextOnscreen.drawImage(this.canvasOffscreen, 0, 0, this.onscreenWidth, this.onscreenHeight);
        }
    }

    setSmoothScaling(doSmoothing) {
        this.doSmoothing = !!doSmoothing;
        this.processSmoothing();
    }

    processSmoothing() {
        if (this.graphicsFound) {
            this.canvas.className = this.doSmoothing ? 'textureSmooth' : 'texturePixelated';
            this.drawContextOnscreen.mozImageSmoothingEnabled = this.doSmoothing;
            this.drawContextOnscreen.webkitImageSmoothingEnabled = this.doSmoothing;
            this.drawContextOnscreen.imageSmoothingEnabled = this.doSmoothing;
        }
    }
}
