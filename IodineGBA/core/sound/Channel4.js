'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
class GameBoyAdvanceChannel4Synth {
    constructor(sound) {
        this.sound = sound;
        this.currentSampleLeft = 0;
        this.currentSampleRight = 0;
        this.totalLength = 0x40;
        this.envelopeVolume = 0;
        this.FrequencyPeriod = 32;
        this.lastSampleLookup = 0;
        this.BitRange = 0x7fff;
        this.VolumeShifter = 15;
        this.currentVolume = 0;
        this.consecutive = true;
        this.envelopeSweeps = 0;
        this.envelopeSweepsLast = -1;
        this.canPlay = false;
        this.Enabled = 0;
        this.counter = 0;
        this.leftEnable = 0;
        this.rightEnable = 0;
        this.nr42 = 0;
        this.nr43 = 0;
        this.nr44 = 0;
        this.cachedSample = 0;
        this.intializeWhiteNoise();
        this.noiseSampleTable = this.LSFR15Table;
    }

    intializeWhiteNoise() {
        //Noise Sample Tables:
        var randomFactor = 1;
        //15-bit LSFR Cache Generation:
        this.LSFR15Table = getInt8Array(0x80000);
        var LSFR = 0x7fff; //Seed value has all its bits set.
        var LSFRShifted = 0x3fff;
        for (var index = 0; index < 0x8000; ++index) {
            //Normalize the last LSFR value for usage:
            randomFactor = 1 - (LSFR & 1); //Docs say it's the inverse.
            //Cache the different volume level results:
            this.LSFR15Table[0x08000 | index] = randomFactor;
            this.LSFR15Table[0x10000 | index] = randomFactor * 0x2;
            this.LSFR15Table[0x18000 | index] = randomFactor * 0x3;
            this.LSFR15Table[0x20000 | index] = randomFactor * 0x4;
            this.LSFR15Table[0x28000 | index] = randomFactor * 0x5;
            this.LSFR15Table[0x30000 | index] = randomFactor * 0x6;
            this.LSFR15Table[0x38000 | index] = randomFactor * 0x7;
            this.LSFR15Table[0x40000 | index] = randomFactor * 0x8;
            this.LSFR15Table[0x48000 | index] = randomFactor * 0x9;
            this.LSFR15Table[0x50000 | index] = randomFactor * 0xa;
            this.LSFR15Table[0x58000 | index] = randomFactor * 0xb;
            this.LSFR15Table[0x60000 | index] = randomFactor * 0xc;
            this.LSFR15Table[0x68000 | index] = randomFactor * 0xd;
            this.LSFR15Table[0x70000 | index] = randomFactor * 0xe;
            this.LSFR15Table[0x78000 | index] = randomFactor * 0xf;
            //Recompute the LSFR algorithm:
            LSFRShifted = LSFR >> 1;
            LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 14);
        }
        //7-bit LSFR Cache Generation:
        this.LSFR7Table = getInt8Array(0x800);
        LSFR = 0x7f; //Seed value has all its bits set.
        for (index = 0; index < 0x80; ++index) {
            //Normalize the last LSFR value for usage:
            randomFactor = 1 - (LSFR & 1); //Docs say it's the inverse.
            //Cache the different volume level results:
            this.LSFR7Table[0x080 | index] = randomFactor;
            this.LSFR7Table[0x100 | index] = randomFactor * 0x2;
            this.LSFR7Table[0x180 | index] = randomFactor * 0x3;
            this.LSFR7Table[0x200 | index] = randomFactor * 0x4;
            this.LSFR7Table[0x280 | index] = randomFactor * 0x5;
            this.LSFR7Table[0x300 | index] = randomFactor * 0x6;
            this.LSFR7Table[0x380 | index] = randomFactor * 0x7;
            this.LSFR7Table[0x400 | index] = randomFactor * 0x8;
            this.LSFR7Table[0x480 | index] = randomFactor * 0x9;
            this.LSFR7Table[0x500 | index] = randomFactor * 0xa;
            this.LSFR7Table[0x580 | index] = randomFactor * 0xb;
            this.LSFR7Table[0x600 | index] = randomFactor * 0xc;
            this.LSFR7Table[0x680 | index] = randomFactor * 0xd;
            this.LSFR7Table[0x700 | index] = randomFactor * 0xe;
            this.LSFR7Table[0x780 | index] = randomFactor * 0xf;
            //Recompute the LSFR algorithm:
            LSFRShifted = LSFR >> 1;
            LSFR = LSFRShifted | (((LSFRShifted ^ LSFR) & 0x1) << 6);
        }
    }

    disabled() {
        //Clear NR41:
        this.totalLength = 0x40;
        //Clear NR42:
        this.nr42 = 0;
        this.envelopeVolume = 0;
        //Clear NR43:
        this.nr43 = 0;
        this.FrequencyPeriod = 32;
        this.lastSampleLookup = 0;
        this.BitRange = 0x7fff;
        this.VolumeShifter = 15;
        this.currentVolume = 0;
        this.noiseSampleTable = this.LSFR15Table;
        //Clear NR44:
        this.nr44 = 0;
        this.consecutive = true;
        this.envelopeSweeps = 0;
        this.envelopeSweepsLast = -1;
        this.canPlay = false;
        this.Enabled = 0;
        this.counter = 0;
    }

    clockAudioLength() {
        if ((this.totalLength | 0) > 1) {
            this.totalLength = ((this.totalLength | 0) - 1) | 0;
        } else if ((this.totalLength | 0) == 1) {
            this.totalLength = 0;
            this.enableCheck();
            this.sound.unsetNR52(0xf7); //Channel #4 On Flag Off
        }
    }

    clockAudioEnvelope() {
        if ((this.envelopeSweepsLast | 0) > -1) {
            if ((this.envelopeSweeps | 0) > 0) {
                this.envelopeSweeps = ((this.envelopeSweeps | 0) - 1) | 0;
            } else {
                if (!this.envelopeType) {
                    if ((this.envelopeVolume | 0) > 0) {
                        this.envelopeVolume = ((this.envelopeVolume | 0) - 1) | 0;
                        this.currentVolume = (this.envelopeVolume | 0) << (this.VolumeShifter | 0);
                        this.envelopeSweeps = this.envelopeSweepsLast | 0;
                    } else {
                        this.envelopeSweepsLast = -1;
                    }
                } else if ((this.envelopeVolume | 0) < 0xf) {
                    this.envelopeVolume = ((this.envelopeVolume | 0) + 1) | 0;
                    this.currentVolume = (this.envelopeVolume | 0) << (this.VolumeShifter | 0);
                    this.envelopeSweeps = this.envelopeSweepsLast | 0;
                } else {
                    this.envelopeSweepsLast = -1;
                }
            }
        }
    }

    computeAudioChannel() {
        if ((this.counter | 0) == 0) {
            this.lastSampleLookup = ((this.lastSampleLookup | 0) + 1) & this.BitRange;
            this.counter = this.FrequencyPeriod | 0;
        }
    }

    enableCheck() {
        if ((this.consecutive || (this.totalLength | 0) > 0) && this.canPlay) {
            this.Enabled = 0xf;
        } else {
            this.Enabled = 0;
        }
    }

    volumeEnableCheck() {
        this.canPlay = (this.nr42 | 0) > 7;
        this.enableCheck();
    }

    outputLevelCache() {
        var cachedSample = this.cachedSample & this.Enabled;
        this.currentSampleLeft = this.leftEnable & cachedSample;
        this.currentSampleRight = this.rightEnable & cachedSample;
    }

    setChannelOutputEnable(data) {
        data = data | 0;
        //Set by NR51 handler:
        this.rightEnable = (data << 28) >> 31;
        this.leftEnable = (data << 24) >> 31;
    }

    updateCache() {
        this.cachedSample = this.noiseSampleTable[this.currentVolume | this.lastSampleLookup] | 0;
        this.outputLevelCache();
    }

    writeSOUND4CNT_L0(data) {
        data = data | 0;
        //NR41:
        this.totalLength = (0x40 - (data & 0x3f)) | 0;
        this.enableCheck();
    }

    writeSOUND4CNT_L1(data) {
        data = data | 0;
        //NR42:
        this.envelopeType = (data & 0x08) != 0;
        this.nr42 = data & 0xff;
        this.volumeEnableCheck();
    }

    readSOUND4CNT_L() {
        //NR42:
        return this.nr42 | 0;
    }

    writeSOUND4CNT_H0(data) {
        data = data | 0;
        //NR43:
        this.FrequencyPeriod = Math.max((data & 0x7) << 4, 8) << ((((data >> 4) & 0xf) + 2) | 0);
        var bitWidth = data & 0x8;
        if (((bitWidth | 0) == 0x8 && (this.BitRange | 0) == 0x7fff) || ((bitWidth | 0) == 0 && (this.BitRange | 0) == 0x7f)) {
            this.lastSampleLookup = 0;
            this.BitRange = (bitWidth | 0) == 0x8 ? 0x7f : 0x7fff;
            this.VolumeShifter = (bitWidth | 0) == 0x8 ? 7 : 15;
            this.currentVolume = this.envelopeVolume << (this.VolumeShifter | 0);
            this.noiseSampleTable = (bitWidth | 0) == 0x8 ? this.LSFR7Table : this.LSFR15Table;
        }
        this.nr43 = data & 0xff;
    }

    readSOUND4CNT_H0() {
        //NR43:
        return this.nr43 | 0;
    }

    writeSOUND4CNT_H1(data) {
        data = data | 0;
        //NR44:
        this.nr44 = data & 0xff;
        this.consecutive = (data & 0x40) == 0x0;
        if ((data & 0x80) != 0) {
            this.envelopeVolume = this.nr42 >> 4;
            this.currentVolume = this.envelopeVolume << (this.VolumeShifter | 0);
            this.envelopeSweepsLast = ((this.nr42 & 0x7) - 1) | 0;
            if ((this.totalLength | 0) == 0) {
                this.totalLength = 0x40;
            }
            if ((data & 0x40) != 0) {
                this.sound.setNR52(0x8);
            }
        }
        this.enableCheck();
    }

    readSOUND4CNT_H1() {
        //NR44:
        return this.nr44 | 0;
    }
}
