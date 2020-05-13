'use strict';
/*
 Copyright (C) 2012-2019 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

let gfxBuffers = null;
let gfxCounters = null;

class IodineGBAWorkerGfxShim {
    constructor() {
        this.gfx = null;
        gfxBuffers = [getSharedUint8Array(160 * 240 * 3), getSharedUint8Array(160 * 240 * 3)];
        gfxCounters = getSharedInt32Array(3);
        this.Iodine = new GameBoyAdvanceEmulator();
    }

    play() {
        this.Iodine.play();
    }

    pause() {
        this.Iodine.pause();
    }

    restart() {
        this.Iodine.restart();
    }

    setIntervalRate(rate) {
        rate = +rate;
        this.Iodine.setIntervalRate(+rate);
    }

    timerCallback(timestamp) {
        timestamp = timestamp >>> 0;
        this.Iodine.timerCallback(timestamp);
    }

    attachGraphicsFrameHandler(gfx) {
        this.gfx = gfx;
        var parentObj = this;
        this.gfx.attachGfxCallback(function () {
            parentObj.graphicsHeartBeat();
        });
        this.Iodine.attachGraphicsFrameHandler(gfx);
    }

    attachAudioHandler(audio) {
        this.Iodine.attachAudioHandler(audio);
    }

    enableAudio() {
        this.Iodine.enableAudio();
    }

    disableAudio() {
        this.Iodine.disableAudio();
    }

    toggleSkipBootROM(doEnable) {
        doEnable = doEnable | 0;
        this.Iodine.toggleSkipBootROM(doEnable | 0);
    }

    toggleDynamicSpeed(doEnable) {
        doEnable = doEnable | 0;
        this.Iodine.toggleDynamicSpeed(doEnable | 0);
    }

    toggleOffthreadGraphics(doEnable) {
        doEnable = doEnable | 0;
        this.Iodine.toggleOffthreadGraphics(doEnable | 0);
    }

    attachSpeedHandler(speed) {
        this.Iodine.attachSpeedHandler(speed);
    }

    attachPlayStatusHandler(playStatus) {
        this.Iodine.attachPlayStatusHandler(playStatus);
    }

    keyDown(keyCode) {
        keyCode = keyCode | 0;
        this.Iodine.keyDown(keyCode | 0);
    }

    keyUp(keyCode) {
        keyCode = keyCode | 0;
        this.Iodine.keyUp(keyCode | 0);
    }

    incrementSpeed(newSpeed) {
        newSpeed = +newSpeed;
        this.Iodine.incrementSpeed(+newSpeed);
    }

    setSpeed(newSpeed) {
        newSpeed = +newSpeed;
        this.Iodine.setSpeed(+newSpeed);
    }

    attachBIOS(BIOS) {
        this.Iodine.attachBIOS(BIOS);
    }

    attachROM(ROM) {
        this.Iodine.attachROM(ROM);
    }

    exportSave() {
        this.Iodine.exportSave();
    }

    attachSaveExportHandler(saveExport) {
        this.Iodine.attachSaveExportHandler(saveExport);
    }

    attachSaveImportHandler(saveImport) {
        this.Iodine.attachSaveImportHandler(saveImport);
    }

    graphicsHeartBeat() {
        //If graphics callback handle provided and we got a buffer reference:
        if (this.gfx && gfxCounters) {
            //Copy the buffer out to local:
            this.consumeGraphicsBuffer();
            //Wake up the producer thread:
            Atomics.notify(gfxCounters, 2, 1);
        }
    }

    consumeGraphicsBuffer() {
        //Load the counter values:
        let start = gfxCounters[0] | 0; //Written by this thread.
        const end = Atomics.load(gfxCounters, 1) | 0; //Written by the other thread.
        //Don't process if nothing to process:
        if ((end | 0) == (start | 0)) {
            //Buffer is empty:
            return;
        }
        //Copy samples out from the ring buffer:
        do {
            //Hardcoded for 2 buffers for a triple buffer effect:
            this.gfx.copyBuffer(gfxBuffers[start & 0x1]);
            start = ((start | 0) + 1) | 0;
        } while ((start | 0) != (end | 0));
        //Update the starting position counter to match the end position:
        //Let the other Atomic loads/stores naturally flush this value:
        gfxCounters[0] = end | 0;
    }
}
