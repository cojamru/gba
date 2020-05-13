'use strict';
/*
 Copyright (C) 2012-2015 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class GameBoyAdvanceChannel2Synth {
    constructor(sound) {
        this.sound = sound;
        this.currentSampleLeft = 0;
        this.currentSampleRight = 0;
        this.CachedDuty = 0xf0000000;
        this.totalLength = 0x40;
        this.envelopeVolume = 0;
        this.frequency = 0;
        this.FrequencyTracker = 0x8000;
        this.consecutive = true;
        this.ShadowFrequency = 0x8000;
        this.canPlay = false;
        this.Enabled = 0;
        this.envelopeSweeps = 0;
        this.envelopeSweepsLast = -1;
        this.FrequencyCounter = 0;
        this.DutyTracker = 0;
        this.leftEnable = 0;
        this.rightEnable = 0;
        this.nr21 = 0;
        this.nr22 = 0;
        this.nr23 = 0;
        this.nr24 = 0;
    }
    disabled() {
        //Clear NR21:
        this.nr21 = 0;
        this.CachedDuty = 0xf0000000;
        this.totalLength = 0x40;
        //Clear NR22:
        this.nr22 = 0;
        this.envelopeVolume = 0;
        //Clear NR23:
        this.nr23 = 0;
        this.frequency = 0;
        this.FrequencyTracker = 0x8000;
        //Clear NR24:
        this.nr24 = 0;
        this.consecutive = true;
        this.canPlay = false;
        this.Enabled = 0;
        this.envelopeSweeps = 0;
        this.envelopeSweepsLast = -1;
        this.FrequencyCounter = 0;
        this.DutyTracker = 0;
    }
    clockAudioLength() {
        if ((this.totalLength | 0) > 1) {
            this.totalLength = ((this.totalLength | 0) - 1) | 0;
        } else if ((this.totalLength | 0) == 1) {
            this.totalLength = 0;
            this.enableCheck();
            this.sound.unsetNR52(0xfd); //Channel #2 On Flag Off
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
                        this.envelopeSweeps = this.envelopeSweepsLast | 0;
                    } else {
                        this.envelopeSweepsLast = -1;
                    }
                } else if ((this.envelopeVolume | 0) < 0xf) {
                    this.envelopeVolume = ((this.envelopeVolume | 0) + 1) | 0;
                    this.envelopeSweeps = this.envelopeSweepsLast | 0;
                } else {
                    this.envelopeSweepsLast = -1;
                }
            }
        }
    }
    computeAudioChannel() {
        if ((this.FrequencyCounter | 0) == 0) {
            this.FrequencyCounter = this.FrequencyTracker | 0;
            this.DutyTracker = ((this.DutyTracker | 0) + 4) & 0x1c;
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
        this.canPlay = (this.nr22 | 0) > 7;
        this.enableCheck();
    }
    outputLevelCache() {
        var duty = this.CachedDuty >> (this.DutyTracker | 0);
        var envelopeVolume = this.envelopeVolume & this.Enabled & duty;
        this.currentSampleLeft = this.leftEnable & envelopeVolume;
        this.currentSampleRight = this.rightEnable & envelopeVolume;
    }
    setChannelOutputEnable(data) {
        data = data | 0;
        //Set by NR51 handler:
        this.rightEnable = (data << 30) >> 31;
        this.leftEnable = (data << 26) >> 31;
    }
    readSOUND2CNT_L0() {
        //NR21:
        return this.nr21 | 0;
    }
    writeSOUND2CNT_L0(data) {
        data = data | 0;
        //NR21:
        switch ((data >> 6) & 0x3) {
            case 0:
                this.CachedDuty = 0xf0000000;
                break;
            case 1:
                this.CachedDuty = 0xf000000f;
                break;
            case 2:
                this.CachedDuty = 0xfff0000f;
                break;
            default:
                this.CachedDuty = 0x0ffffff0;
        }
        this.totalLength = (0x40 - (data & 0x3f)) | 0;
        this.nr21 = data & 0xff;
        this.enableCheck();
    }
    readSOUND2CNT_L1() {
        //NR22:
        return this.nr22 | 0;
    }
    writeSOUND2CNT_L1(data) {
        data = data | 0;
        //NR22:
        this.envelopeType = (data & 0x08) != 0;
        this.nr22 = data & 0xff;
        this.volumeEnableCheck();
    }
    writeSOUND2CNT_H0(data) {
        data = data | 0;
        //NR23:
        this.frequency = (this.frequency & 0x700) | (data & 0xff);
        this.FrequencyTracker = (0x800 - (this.frequency | 0)) << 4;
    }
    readSOUND2CNT_H() {
        //NR24:
        return this.nr24 | 0;
    }
    writeSOUND2CNT_H1(data) {
        data = data | 0;
        //NR24:
        if ((data & 0x80) != 0) {
            //Reload nr22:
            this.envelopeVolume = this.nr22 >> 4;
            this.envelopeSweepsLast = ((this.nr22 & 0x7) - 1) | 0;
            if ((this.totalLength | 0) == 0) {
                this.totalLength = 0x40;
            }
            if ((data & 0x40) != 0) {
                this.sound.setNR52(0x2); //Channel #1 On Flag Off
            }
        }
        this.consecutive = (data & 0x40) == 0x0;
        this.frequency = ((data & 0x7) << 8) | (this.frequency & 0xff);
        this.FrequencyTracker = (0x800 - (this.frequency | 0)) << 4;
        this.nr24 = data & 0xff;
        this.enableCheck();
    }
}
