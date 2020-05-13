'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceGraphics {
    constructor(IOCore) {
        //Build references:
        this.IOCore = IOCore;
    }

    initialize() {
        this.gfxRenderer = this.IOCore.gfxRenderer;
        this.dma = this.IOCore.dma;
        this.dmaChannel3 = this.IOCore.dmaChannel3;
        this.irq = this.IOCore.irq;
        this.wait = this.IOCore.wait;
        this.initializeState();
    }

    initializeState() {
        //Initialize Pre-Boot:
        this.renderedScanLine = false;
        this.statusFlags = 0;
        this.IRQFlags = 0;
        this.VCounter = 0;
        this.currentScanLine = 0;
        this.LCDTicks = 0;
        if (this.IOCore.SKIPBoot) {
            //BIOS entered the ROM at line 0x7C:
            this.currentScanLine = 0x7c;
        }
    }

    addClocks(clocks) {
        clocks = clocks | 0;
        //Call this when clocking the state some more:
        this.LCDTicks = ((this.LCDTicks | 0) + (clocks | 0)) | 0;
        this.clockLCDState();
    }

    clockLCDState() {
        if ((this.LCDTicks | 0) >= 960) {
            this.clockScanLine(); //Line finishes drawing at clock 960.
            this.clockLCDStatePostRender(); //Check for hblank and clocking into next line.
        }
    }

    clockScanLine() {
        if (!this.renderedScanLine) {
            //If we rendered the scanline, don't run this again.
            this.renderedScanLine = true; //Mark rendering.
            if ((this.currentScanLine | 0) < 160) {
                this.gfxRenderer.incrementScanLineQueue(); //Tell the gfx JIT to queue another line to draw.
            }
        }
    }

    clockLCDStatePostRender() {
        if ((this.LCDTicks | 0) >= 1006) {
            //HBlank Event Occurred:
            this.updateHBlank();
            if ((this.LCDTicks | 0) >= 1232) {
                //Clocking to next line occurred:
                this.clockLCDNextLine();
            }
        }
    }

    clockLCDNextLine() {
        /*We've now overflowed the LCD scan line state machine counter,
         which tells us we need to be on a new scan-line and refresh over.*/
        this.renderedScanLine = false; //Unmark line render.
        this.statusFlags = this.statusFlags & 0x5; //Un-mark HBlank.
        //De-clock for starting on new scan-line:
        this.LCDTicks = ((this.LCDTicks | 0) - 1232) | 0; //We start out at the beginning of the next line.
        //Increment scanline counter:
        this.currentScanLine = ((this.currentScanLine | 0) + 1) | 0; //Increment to the next scan line.
        //Handle switching in/out of vblank:
        if ((this.currentScanLine | 0) >= 160) {
            //Handle special case scan lines of vblank:
            switch (this.currentScanLine | 0) {
                case 160:
                    this.updateVBlankStart(); //Update state for start of vblank.
                case 161:
                    this.dmaChannel3.gfxDisplaySyncRequest(); //Display Sync. DMA trigger.
                    break;
                case 162:
                    this.dmaChannel3.gfxDisplaySyncEnableCheck(); //Display Sync. DMA reset on start of line 162.
                    break;
                case 227:
                    this.statusFlags = this.statusFlags & 0x6; //Un-mark VBlank on start of last vblank line.
                    break;
                case 228:
                    this.currentScanLine = 0; //Reset scan-line to zero (First line of draw).
            }
        } else if ((this.currentScanLine | 0) > 1) {
            this.dmaChannel3.gfxDisplaySyncRequest(); //Display Sync. DMA trigger.
        }
        this.checkVCounter(); //We're on a new scan line, so check the VCounter for match.
        this.isRenderingCheckPreprocess(); //Update a check value.
        //Recursive clocking of the LCD state:
        this.clockLCDState();
    }

    updateHBlank() {
        if ((this.statusFlags & 0x2) == 0) {
            //If we were last in HBlank, don't run this again.
            this.statusFlags = this.statusFlags | 0x2; //Mark HBlank.
            if ((this.IRQFlags & 0x10) != 0) {
                this.irq.requestIRQ(0x2); //Check for IRQ.
            }
            if ((this.currentScanLine | 0) < 160) {
                this.dma.gfxHBlankRequest(); //Check for HDMA Trigger.
            }
            this.isRenderingCheckPreprocess(); //Update a check value.
        }
    }

    checkVCounter() {
        if ((this.currentScanLine | 0) == (this.VCounter | 0)) {
            //Check for VCounter match.
            this.statusFlags = this.statusFlags | 0x4;
            if ((this.IRQFlags & 0x20) != 0) {
                //Check for VCounter IRQ.
                this.irq.requestIRQ(0x4);
            }
        } else {
            this.statusFlags = this.statusFlags & 0x3;
        }
    }

    nextVBlankIRQEventTime() {
        let nextEventTime = 0x7fffffff;
        if ((this.IRQFlags & 0x8) != 0) {
            //Only give a time if we're allowed to irq:
            nextEventTime = this.nextVBlankEventTime() | 0;
        }
        return nextEventTime | 0;
    }

    nextHBlankEventTime() {
        let time = this.LCDTicks | 0;
        if ((time | 0) < 1006) {
            //Haven't reached hblank yet, so hblank offset - current:
            time = (1006 - (time | 0)) | 0;
        } else {
            //We're in hblank, so it's end clock - current + next scanline hblank offset:
            time = (2238 - (time | 0)) | 0;
        }
        return time | 0;
    }

    nextHBlankIRQEventTime() {
        let nextEventTime = 0x7fffffff;
        if ((this.IRQFlags & 0x10) != 0) {
            //Only give a time if we're allowed to irq:
            nextEventTime = this.nextHBlankEventTime() | 0;
        }
        return nextEventTime | 0;
    }
    nextVCounterIRQEventTime() {
        let nextEventTime = 0x7fffffff;
        if ((this.IRQFlags & 0x20) != 0) {
            //Only give a time if we're allowed to irq:
            nextEventTime = this.nextVCounterEventTime() | 0;
        }
        return nextEventTime | 0;
    }

    nextVBlankEventTime() {
        let nextEventTime = this.currentScanLine | 0;
        if ((nextEventTime | 0) < 160) {
            //Haven't reached vblank yet, so vblank offset - current:
            nextEventTime = (160 - (nextEventTime | 0)) | 0;
        } else {
            //We're in vblank, so it's end clock - current + next frame vblank offset:
            nextEventTime = (388 - (nextEventTime | 0)) | 0;
        }
        //Convert line count to clocks:
        nextEventTime = this.convertScanlineToClocks(nextEventTime | 0) | 0;
        //Subtract scanline offset from clocks:
        nextEventTime = ((nextEventTime | 0) - (this.LCDTicks | 0)) | 0;
        return nextEventTime | 0;
    }

    nextHBlankDMAEventTime() {
        let nextEventTime = this.nextHBlankEventTime() | 0;
        if ((this.currentScanLine | 0) > 159 || ((this.currentScanLine | 0) == 159 && (this.LCDTicks | 0) >= 1006)) {
            //No HBlank DMA in VBlank:
            let linesToSkip = (227 - (this.currentScanLine | 0)) | 0;
            linesToSkip = this.convertScanlineToClocks(linesToSkip | 0) | 0;
            nextEventTime = ((nextEventTime | 0) + (linesToSkip | 0)) | 0;
        }
        return nextEventTime | 0;
    }

    nextVCounterEventTime() {
        let nextEventTime = 0x7fffffff;
        if ((this.VCounter | 0) <= 227) {
            //Only match lines within screen or vblank:
            nextEventTime = ((this.VCounter | 0) - (this.currentScanLine | 0)) | 0;
            if ((nextEventTime | 0) <= 0) {
                nextEventTime = ((nextEventTime | 0) + 228) | 0;
            }
            nextEventTime = this.convertScanlineToClocks(nextEventTime | 0) | 0;
            nextEventTime = ((nextEventTime | 0) - (this.LCDTicks | 0)) | 0;
        }
        return nextEventTime | 0;
    }

    nextDisplaySyncEventTime(delay) {
        delay = delay | 0;
        let nextEventTime = 0x7fffffff;
        if ((this.currentScanLine | 0) >= 161 || (delay | 0) != 0) {
            //Skip to line 2 metrics:
            nextEventTime = (230 - (this.currentScanLine | 0)) | 0;
            nextEventTime = this.convertScanlineToClocks(nextEventTime | 0) | 0;
            nextEventTime = ((nextEventTime | 0) - (this.LCDTicks | 0)) | 0;
        } else if ((this.currentScanLine | 0) == 0) {
            //Doesn't start until line 2:
            nextEventTime = (2464 - (this.LCDTicks | 0)) | 0;
        } else {
            //Line 2 through line 161:
            nextEventTime = (1232 - (this.LCDTicks | 0)) | 0;
        }
        return nextEventTime | 0;
    }

    //Math.imul found, insert the optimized path in:
    convertScanlineToClocks(lines) {
        lines = lines | 0;

        if (typeof Math.imul == 'function') {
            lines = Math.imul(lines | 0, 1232) | 0;
        } else {
            lines = ((lines | 0) * 1232) | 0;
        }

        return lines | 0;
    }

    updateVBlankStart() {
        this.statusFlags = this.statusFlags | 0x1; //Mark VBlank.
        if ((this.IRQFlags & 0x8) != 0) {
            //Check for VBlank IRQ.
            this.irq.requestIRQ(0x1);
        }
        this.gfxRenderer.ensureFraming();
        this.dma.gfxVBlankRequest();
    }

    isRenderingCheckPreprocess() {
        let isInVisibleLines = (this.gfxRenderer.IOData8[0] & 0x80) == 0 && (this.statusFlags & 0x1) == 0;
        let isRendering = isInVisibleLines && (this.statusFlags & 0x2) == 0 ? 2 : 1;
        let isOAMRendering = isInVisibleLines && ((this.statusFlags & 0x2) == 0 || (this.gfxRenderer.IOData8[0] & 0x20) == 0) ? 2 : 1;
        this.wait.updateRenderStatus(isRendering | 0, isOAMRendering | 0);
    }

    writeDISPSTAT8_0(data) {
        data = data | 0;
        this.IOCore.updateCoreClocking();
        //VBlank flag read only.
        //HBlank flag read only.
        //V-Counter flag read only.
        //Only LCD IRQ generation enablers can be set here:
        this.IRQFlags = data & 0x38;
        this.IOCore.updateCoreEventTime();
    }

    writeDISPSTAT8_1(data) {
        data = data | 0;
        data = data & 0xff;
        //V-Counter match value:
        if ((data | 0) != (this.VCounter | 0)) {
            this.IOCore.updateCoreClocking();
            this.VCounter = data | 0;
            this.checkVCounter();
            this.IOCore.updateCoreEventTime();
        }
    }

    writeDISPSTAT16(data) {
        data = data | 0;
        this.IOCore.updateCoreClocking();
        //VBlank flag read only.
        //HBlank flag read only.
        //V-Counter flag read only.
        //Only LCD IRQ generation enablers can be set here:
        this.IRQFlags = data & 0x38;
        data = (data >> 8) & 0xff;
        //V-Counter match value:
        if ((data | 0) != (this.VCounter | 0)) {
            this.VCounter = data | 0;
            this.checkVCounter();
        }
        this.IOCore.updateCoreEventTime();
    }

    readDISPSTAT8_0() {
        this.IOCore.updateGraphicsClocking();
        return this.statusFlags | this.IRQFlags;
    }

    readDISPSTAT8_1() {
        return this.VCounter | 0;
    }

    readDISPSTAT8_2() {
        this.IOCore.updateGraphicsClocking();
        return this.currentScanLine | 0;
    }

    readDISPSTAT16_0() {
        this.IOCore.updateGraphicsClocking();
        return (this.VCounter << 8) | this.statusFlags | this.IRQFlags;
    }

    readDISPSTAT32() {
        this.IOCore.updateGraphicsClocking();
        return (this.currentScanLine << 16) | (this.VCounter << 8) | this.statusFlags | this.IRQFlags;
    }
}
