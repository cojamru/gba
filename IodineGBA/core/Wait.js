'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceWait {
    constructor(IOCore) {
        //Build references:
        this.IOCore = IOCore;
    }

    initialize() {
        this.memory = this.IOCore.memory;
        this.cpu = this.IOCore.cpu;
        this.WRAMConfiguration = 0xd000020; //WRAM configuration control register current data.
        this.WRAMWaitState = 3; //External WRAM wait state.
        this.SRAMWaitState = 5; //SRAM wait state.
        this.WAITCNT0 = 0; //WAITCNT0 control register data.
        this.WAITCNT1 = 0; //WAITCNT1 control register data.
        this.POSTBOOT = 0; //POSTBOOT control register data.
        this.isRendering = 1; //Are we doing memory during screen draw?
        this.isOAMRendering = 1; //Are we doing memory during OAM draw?
        this.nonSequential = 0x10; //Non-sequential access bit-flag.
        this.buffer = 0; //Tracking of the size of the prebuffer cache.
        this.clocks = 0; //Tracking clocks for prebuffer cache.
        //Create the wait state address translation cache:
        this.waitStateClocks16 = getUint8Array(0x20);
        this.waitStateClocks32 = getUint8Array(0x20);
        //Wait State 0:
        this.setWaitState(0, 0);
        //Wait State 1:
        this.setWaitState(1, 0);
        //Wait State 2:
        this.setWaitState(2, 0);
        //Initialize out some dynamic references:
        this.getROMRead16 = this.getROMRead16NoPrefetch;
        this.getROMRead32 = this.getROMRead32NoPrefetch;
        this.CPUInternalCyclePrefetch = this.CPUInternalCycleNoPrefetch;
        this.CPUInternalSingleCyclePrefetch = this.CPUInternalSingleCycleNoPrefetch;
    }

    getWaitStateFirstAccess(data) {
        //Get the first access timing:
        data = data | 0;
        data = data & 0x3;
        if ((data | 0) < 0x3) {
            data = (5 - (data | 0)) | 0;
        } else {
            data = 9;
        }
        return data | 0;
    }

    getWaitStateSecondAccess(region, data) {
        //Get the second access timing:
        region = region | 0;
        data = data | 0;
        if ((data & 0x4) == 0) {
            data = 0x2 << (region | 0);
            data = ((data | 0) + 1) | 0;
        } else {
            data = 0x2;
        }
        return data | 0;
    }

    setWaitState(region, data) {
        region = region | 0;
        data = data | 0;
        //Wait State First Access:
        var firstAccess = this.getWaitStateFirstAccess(data & 0x3) | 0;
        //Wait State Second Access:
        var secondAccess = this.getWaitStateSecondAccess(region | 0, data | 0) | 0;
        region = region << 1;
        //Computing First Access:
        //8-16 bit access:
        this.waitStateClocks16[0x18 | region] = firstAccess | 0;
        this.waitStateClocks16[0x19 | region] = firstAccess | 0;
        //32 bit access:
        var accessTime = ((firstAccess | 0) + (secondAccess | 0)) | 0;
        this.waitStateClocks32[0x18 | region] = accessTime | 0;
        this.waitStateClocks32[0x19 | region] = accessTime | 0;
        //Computing Second Access:
        //8-16 bit access:
        this.waitStateClocks16[0x8 | region] = secondAccess | 0;
        this.waitStateClocks16[0x9 | region] = secondAccess | 0;
        //32 bit access:
        this.waitStateClocks32[0x8 | region] = secondAccess << 1;
        this.waitStateClocks32[0x9 | region] = secondAccess << 1;
    }

    writeWAITCNT8_0(data) {
        data = data | 0;
        //Set SRAM Wait State:
        if ((data & 0x3) < 0x3) {
            this.SRAMWaitState = (5 - (data & 0x3)) | 0;
        } else {
            this.SRAMWaitState = 9;
        }
        data = data & 0xff;
        //Set Wait State 0:
        this.setWaitState(0, data >> 2);
        //Set Wait State 1:
        this.setWaitState(1, data >> 5);
        this.WAITCNT0 = data | 0;
    }

    readWAITCNT8_0() {
        return this.WAITCNT0 | 0;
    }

    writeWAITCNT8_1(data) {
        data = data | 0;
        //Set Wait State 2:
        this.setWaitState(2, data & 0xff);
        //Set Prefetch Mode:
        if ((data & 0x40) == 0) {
            //No Prefetch:
            this.resetPrebuffer();
            this.getROMRead16 = this.getROMRead16NoPrefetch;
            this.getROMRead32 = this.getROMRead32NoPrefetch;
            this.CPUInternalCyclePrefetch = this.CPUInternalCycleNoPrefetch;
            this.CPUInternalSingleCyclePrefetch = this.CPUInternalSingleCycleNoPrefetch;
        } else {
            //Prefetch Enabled:
            this.getROMRead16 = this.getROMRead16Prefetch;
            this.getROMRead32 = this.getROMRead32Prefetch;
            this.CPUInternalCyclePrefetch = this.multiClock;
            this.CPUInternalSingleCyclePrefetch = this.singleClock;
        }
        this.WAITCNT1 = data & 0x5f;
    }

    readWAITCNT8_1() {
        return this.WAITCNT1 | 0;
    }

    writeWAITCNT16(data) {
        this.writeWAITCNT8_0(data | 0);
        this.writeWAITCNT8_1(data >> 8);
    }

    readWAITCNT16() {
        var data = this.WAITCNT0 | 0;
        data = data | (this.WAITCNT1 << 8);
        return data | 0;
    }

    writePOSTBOOT(data) {
        this.POSTBOOT = data & 0xff;
    }

    readPOSTBOOT() {
        return this.POSTBOOT | 0;
    }

    writeHALTCNT(data) {
        data = data | 0;
        this.IOCore.updateCoreSpillRetain();
        //HALT/STOP mode entrance:
        if ((data & 0x80) == 0) {
            //Halt:
            this.IOCore.flagHalt();
        } else {
            //Stop:
            this.IOCore.flagStop();
        }
    }

    writeHALT16(data) {
        data = data | 0;
        this.POSTBOOT = data & 0xff;
        this.IOCore.updateCoreSpillRetain();
        //HALT/STOP mode entrance:
        if ((data & 0x8000) == 0) {
            //Halt:
            this.IOCore.flagHalt();
        } else {
            //Stop:
            this.IOCore.flagStop();
        }
    }

    writeConfigureWRAM8(address, data) {
        address = address | 0;
        data = data | 0;
        switch (address & 0x3) {
            case 0:
                this.memory.remapWRAM(data & 0x21);
                this.WRAMConfiguration = (this.WRAMConfiguration & 0xffffff00) | (data & 0xff);
                break;
            case 1:
                this.WRAMConfiguration = (this.WRAMConfiguration & 0xffff00ff) | ((data & 0xff) << 8);
                break;
            case 2:
                this.WRAMConfiguration = (this.WRAMConfiguration & 0xff00ffff) | ((data & 0xff) << 16);
                break;
            default:
                this.WRAMWaitState = (0x10 - (data & 0xf)) | 0;
                this.WRAMConfiguration = (this.WRAMConfiguration & 0xffffff) | (data << 24);
        }
    }

    writeConfigureWRAM16(address, data) {
        address = address | 0;
        data = data | 0;
        if ((address & 0x2) == 0) {
            this.WRAMConfiguration = (this.WRAMConfiguration & 0xffff0000) | (data & 0xffff);
            this.memory.remapWRAM(data & 0x21);
        } else {
            this.WRAMConfiguration = (data << 16) | (this.WRAMConfiguration & 0xffff);
            this.WRAMWaitState = (0x10 - ((data >> 8) & 0xf)) | 0;
        }
    }

    writeConfigureWRAM32(data) {
        data = data | 0;
        this.WRAMConfiguration = data | 0;
        this.WRAMWaitState = (0x10 - ((data >> 24) & 0xf)) | 0;
        this.memory.remapWRAM(data & 0x21);
    }

    readConfigureWRAM8(address) {
        address = address | 0;
        var data = 0;
        switch (address & 0x3) {
            case 0:
                data = this.WRAMConfiguration & 0x2f;
                break;
            case 3:
                data = this.WRAMConfiguration >>> 24;
        }
        return data | 0;
    }

    readConfigureWRAM16(address) {
        address = address | 0;
        var data = 0;
        if ((address & 0x2) == 0) {
            data = this.WRAMConfiguration & 0x2f;
        } else {
            data = (this.WRAMConfiguration >> 16) & 0xff00;
        }
        return data | 0;
    }

    readConfigureWRAM32() {
        return this.WRAMConfiguration & 0xff00002f;
    }

    CPUInternalCycleNoPrefetch(clocks) {
        clocks = clocks | 0;
        //Clock for idle CPU time:
        this.IOCore.updateCore(clocks | 0);
        //Prebuffer bug:
        this.checkPrebufferBug();
    }

    CPUInternalSingleCycleNoPrefetch() {
        //Clock for idle CPU time:
        this.IOCore.updateCoreSingle();
        //Not enough time for prebuffer buffering, so skip it.
        //Prebuffer bug:
        this.checkPrebufferBug();
    }

    checkPrebufferBug() {
        //Issue a non-sequential cycle for the next read if we did an I-cycle:
        var address = this.cpu.registers[15] | 0;
        if ((address | 0) >= 0x8000000 && (address | 0) < 0xe000000) {
            this.NonSequentialBroadcast();
        }
    }

    NonSequentialBroadcast() {
        //Flag as N cycle:
        this.nonSequential = 0x10;
    }

    NonSequentialBroadcastClear() {
        //PC branched:
        this.NonSequentialBroadcast();
        this.resetPrebuffer();
    }

    check128kAlignmentBug(address) {
        address = address | 0;
        if ((address & 0x1ffff) == 0) {
            this.NonSequentialBroadcast();
        }
    }

    multiClock(clocks) {
        clocks = clocks | 0;
        this.IOCore.updateCore(clocks | 0);
        var address = this.cpu.registers[15] | 0;
        if ((address | 0) >= 0x8000000 && (address | 0) < 0xe000000) {
            if ((this.clocks | 0) < 0xff) {
                this.clocks = ((this.clocks | 0) + (clocks | 0)) | 0;
            }
        } else {
            this.resetPrebuffer();
        }
    }

    singleClock() {
        this.IOCore.updateCoreSingle();
        var address = this.cpu.registers[15] | 0;
        if ((address | 0) >= 0x8000000 && (address | 0) < 0xe000000) {
            if ((this.clocks | 0) < 0xff) {
                this.clocks = ((this.clocks | 0) + 1) | 0;
            }
        } else {
            this.resetPrebuffer();
        }
    }

    addPrebufferSingleClock() {
        this.clocks = ((this.clocks | 0) + 1) | 0;
    }

    decrementBufferSingle() {
        this.buffer = ((this.buffer | 0) - 1) | 0;
    }

    decrementBufferDouble() {
        this.buffer = ((this.buffer | 0) - 2) | 0;
    }

    resetPrebuffer() {
        //Reset the buffering:
        this.clocks = 0;
        this.buffer = 0;
    }

    drainOverdueClocks() {
        if ((this.clocks | 0) > 0 && (this.buffer | 0) < 8) {
            var address = this.cpu.registers[15] >>> 24;
            //Convert built up clocks to 16 bit word buffer units:
            do {
                this.clocks = ((this.clocks | 0) - (this.waitStateClocks16[address | 0] | 0)) | 0;
                this.buffer = ((this.buffer | 0) + 1) | 0;
            } while ((this.clocks | 0) > 0 && (this.buffer | 0) < 8);
            //If we're deficient in clocks, fit them in before the access:
            if ((this.clocks | 0) < 0) {
                this.IOCore.updateCoreNegative(this.clocks | 0);
                this.clocks = 0;
            }
        }
    }

    computeClocks(address) {
        address = address | 0;
        //Convert built up clocks to 16 bit word buffer units:
        while ((this.buffer | 0) < 8 && (this.clocks | 0) >= (this.waitStateClocks16[address | 0] | 0)) {
            this.clocks = ((this.clocks | 0) - (this.waitStateClocks16[address | 0] | 0)) | 0;
            this.buffer = ((this.buffer | 0) + 1) | 0;
        }
    }

    drainOverdueClocksCPU() {
        if ((this.clocks | 0) < 0) {
            //Compute "overdue" clocks:
            this.IOCore.updateCoreNegative(this.clocks | 0);
            this.clocks = 0;
        } else {
            //Buffer satiated, clock 1:
            this.IOCore.updateCoreSingle();
        }
    }

    doGamePakFetch16(address) {
        address = address | 0;
        //Fetch 16 bit word into buffer:
        this.clocks = ((this.clocks | 0) - (this.waitStateClocks16[address | this.nonSequential] | 0)) | 0;
        this.nonSequential = 0;
    }

    doGamePakFetch32(address) {
        address = address | 0;
        //Fetch 16 bit word into buffer:
        this.clocks = ((this.clocks | 0) - (this.waitStateClocks32[address | this.nonSequential] | 0)) | 0;
        this.nonSequential = 0;
    }

    getROMRead16Prefetch(address) {
        //Caching enabled:
        address = address | 0;
        //Resolve clocks to buffer units:
        this.computeClocks(address | 0);
        //Need 16 bits minimum buffered:
        switch (this.buffer | 0) {
            case 0:
                //Fetch 16 bit word into buffer:
                this.doGamePakFetch16(address | 0);
                break;
            default:
                //Instruction fetch is 1 clock wide minimum:
                this.addPrebufferSingleClock();
                //Decrement the buffer:
                this.decrementBufferSingle();
        }
        //Clock the state:
        this.drainOverdueClocksCPU();
    }

    getROMRead16NoPrefetch(address) {
        //Caching disabled:
        address = address | 0;
        this.IOCore.updateCore(this.waitStateClocks16[address | this.nonSequential] | 0);
        this.nonSequential = 0;
    }

    getROMRead32Prefetch(address) {
        //Caching enabled:
        address = address | 0;
        //Resolve clocks to buffer units:
        this.computeClocks(address | 0);
        //Need 32 bits minimum buffered:
        switch (this.buffer | 0) {
            case 0:
                //Fetch two 16 bit words into buffer:
                this.doGamePakFetch32(address | 0);
                break;
            case 1:
                //Fetch a 16 bit word into buffer:
                this.doGamePakFetch16(address | 0);
                this.buffer = 0;
                break;
            default:
                //Instruction fetch is 1 clock wide minimum:
                this.addPrebufferSingleClock();
                //Decrement the buffer:
                this.decrementBufferDouble();
        }
        //Clock the state:
        this.drainOverdueClocksCPU();
    }

    getROMRead32NoPrefetch(address) {
        //Caching disabled:
        address = address | 0;
        this.IOCore.updateCore(this.waitStateClocks32[address | this.nonSequential] | 0);
        this.nonSequential = 0;
    }

    WRAMAccess() {
        this.multiClock(this.WRAMWaitState | 0);
    }

    WRAMAccess16CPU() {
        this.IOCore.updateCore(this.WRAMWaitState | 0);
    }

    WRAMAccess32() {
        this.multiClock(this.WRAMWaitState << 1);
    }

    WRAMAccess32CPU() {
        this.IOCore.updateCore(this.WRAMWaitState << 1);
    }

    ROMAccess(address) {
        address = address | 0;
        this.drainOverdueClocks();
        this.check128kAlignmentBug(address | 0);
        this.IOCore.updateCore(this.waitStateClocks16[(address >> 24) | this.nonSequential] | 0);
        this.nonSequential = 0;
    }

    ROMAccess16CPU(address) {
        address = address | 0;
        this.check128kAlignmentBug(address | 0);
        this.getROMRead16(address >> 24);
    }

    ROMAccess32(address) {
        address = address | 0;
        this.drainOverdueClocks();
        this.check128kAlignmentBug(address | 0);
        this.IOCore.updateCore(this.waitStateClocks32[(address >> 24) | this.nonSequential] | 0);
        this.nonSequential = 0;
    }

    ROMAccess32CPU(address) {
        address = address | 0;
        this.check128kAlignmentBug(address | 0);
        this.getROMRead32(address >> 24);
    }

    SRAMAccess() {
        this.multiClock(this.SRAMWaitState | 0);
    }

    SRAMAccessCPU() {
        this.resetPrebuffer();
        this.IOCore.updateCore(this.SRAMWaitState | 0);
    }

    VRAMAccess() {
        this.multiClock(this.isRendering | 0);
    }

    VRAMAccess16CPU() {
        this.IOCore.updateCore(this.isRendering | 0);
    }

    VRAMAccess32() {
        this.multiClock(this.isRendering << 1);
    }

    VRAMAccess32CPU() {
        this.IOCore.updateCore(this.isRendering << 1);
    }

    OAMAccess() {
        this.multiClock(this.isOAMRendering | 0);
    }

    OAMAccessCPU() {
        this.IOCore.updateCore(this.isOAMRendering | 0);
    }

    updateRenderStatus(isRendering, isOAMRendering) {
        this.isRendering = isRendering | 0;
        this.isOAMRendering = isOAMRendering | 0;
    }
}
